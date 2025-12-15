import { Injectable, UnauthorizedException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import axios, { Method } from 'axios';
import { ConfigService } from '@nestjs/config';
import { encrypt, decrypt } from '../utils/crypto.util';
import ytSearch from 'yt-search';

@Injectable()
export class SpotifyService {
    // --- CACHÉ GENÉRICA EN MEMORIA ---
    private cache = new Map<string, { data: any, expiresAt: number }>();

    constructor(
        private prisma: PrismaService,
        private configService: ConfigService
    ) { }

    // ==============================================================================
    // 1. NÚCLEO: REALIZAR PETICIONES (Maneja Tokens, 401 y 429 automáticamente)
    // ==============================================================================
    private async request<T>(
        userId: number,
        method: Method,
        endpoint: string,
        params: any = {},
        body: any = null,
        headers: any = {}, 
        retries = 3
    ): Promise<T> {
        let token = await this.getUserToken(userId);
        const url = endpoint.startsWith('http') ? endpoint : `https://api.spotify.com/v1${endpoint}`;

        try {
            const response = await axios({
                method,
                url,
                headers: { 
                    Authorization: `Bearer ${token}`,
                    ...headers 
                },
                params,
                data: body
            });
            return response.data;
        } catch (error: any) {
            if (axios.isAxiosError(error) && error.response) {
                const status = error.response.status;

                // CASO 401: Token Vencido
                if (status === 401) {
                    try {
                        await this.refreshSpotifyToken(userId);
                        return this.request(userId, method, endpoint, params, body, headers, retries);
                    } catch (e) {
                        throw new UnauthorizedException('Sesión caducada');
                    }
                }

                // CASO 429: Rate Limit -> ¡AQUÍ ESTÁ LA MEJORA!
                if (status === 429 && retries > 0) {
                    const retryHeader = error.response.headers['retry-after'];
                    // Esperamos lo que dice Spotify O 2 segundos base
                    const baseWaitTime = (retryHeader ? parseInt(retryHeader, 10) + 1 : 2) * 1000;
                    
                    // AGREGAMOS ALEATORIEDAD (JITTER) DE 0 a 1000ms
                    // Esto evita que todas las peticiones reintenten al mismo milisegundo exacto
                    const jitter = Math.floor(Math.random() * 1000); 
                    const totalWait = baseWaitTime + jitter;

                    
                    await new Promise(r => setTimeout(r, totalWait));
                    return this.request(userId, method, endpoint, params, body, headers, retries - 1);
                }
            }
            throw error;
        }
    }

    // ==============================================================================
    // 2. OPTIMIZADOR: OBTENER CON CACHÉ
    // ==============================================================================
    private async getCached<T>(userId: number, key: string, ttlSeconds: number, fetchFn: () => Promise<T>): Promise<T> {
        const cacheKey = `${userId}:${key}`;
        const cached = this.cache.get(cacheKey);
        
        if (cached && Date.now() < cached.expiresAt) {
            return cached.data;
        }

        try {
            const data = await fetchFn();
            this.cache.set(cacheKey, { data, expiresAt: Date.now() + (ttlSeconds * 1000) });
            return data;
        } catch (error) {
            if (cached) return cached.data;
            throw error;
        }
    }

    // ==============================================================================
    // 3. ENDPOINTS PÚBLICOS
    // ==============================================================================

    // --- PLAYER & CONTROLES ---
    
    async getCurrentlyPlaying(userId: number) {
        // Caché de 2 seg para evitar spam del polling
        return this.getCached(userId, 'current-track', 2, () => 
            // PASAMOS 0 RETRIES AL FINAL
            // Si da error 429, devuelve null y no sigue molestando a Spotify
            this.request(userId, 'GET', '/me/player/currently-playing', {}, null, {}, 0)
        ).catch(() => null);
    }

    async play(userId: number, deviceId: string, uris: string[], contextUri?: string) {
        // Objeto body limpio
        const body: any = {};

        if (contextUri) {
            // CASO 1: Reproducir Contexto (Playlist/Album)
            body.context_uri = contextUri;
            
            // Si hay URIs, significa que queremos empezar en una canción específica de esa playlist
            if (Array.isArray(uris) && uris.length > 0) {
                // Validación: El offset DEBE ser un URI válido de Spotify
                const targetUri = uris[0];
                if (typeof targetUri === 'string' && targetUri.includes('spotify:track:')) {
                    body.offset = { uri: targetUri };
                }
            }
        } else {
            // CASO 2: Reproducir Lista de Canciones Sueltas (Likes)
            if (Array.isArray(uris) && uris.length > 0) {
                body.uris = uris.slice(0, 50); // Límite de Spotify
            }
        }


        // Hacemos la petición
        // NOTA: Usamos el wrapper 'request' que ya tienes configurado
        return this.request(userId, 'PUT', `/me/player/play?device_id=${deviceId}`, {}, body);
    }

    // ✅ RECUPERADO: RESUME
    async resume(userId: number, deviceId: string) {
        // Resume es igual a play sin parámetros
        return this.request(userId, 'PUT', '/me/player/play', { device_id: deviceId });
    }

    async pause(userId: number, deviceId?: string) {
        return this.request(userId, 'PUT', '/me/player/pause', { device_id: deviceId }).catch(() => ({}));
    }

    async next(userId: number, deviceId?: string) {
        return this.request(userId, 'POST', '/me/player/next', { device_id: deviceId });
    }

    async previous(userId: number, deviceId?: string) {
        return this.request(userId, 'POST', '/me/player/previous', { device_id: deviceId });
    }

    async seek(userId: number, position_ms: number, deviceId?: string) {
        return this.request(userId, 'PUT', '/me/player/seek', { position_ms, device_id: deviceId });
    }

    async setVolume(userId: number, volume_percent: number, deviceId?: string) {
        return this.request(userId, 'PUT', '/me/player/volume', { volume_percent, device_id: deviceId }).catch(() => ({}));
    }

    async transfer(userId: number, deviceId: string) {
        return this.request(userId, 'PUT', '/me/player', {}, { device_ids: [deviceId], play: true });
    }

    // --- INFO DEL USUARIO & LIBRERÍA ---

    // ✅ RECUPERADO: TOKEN PARA EL SDK
    async getAccessToken(userId: number) {
        const token = await this.getUserToken(userId);
        return { token };
    }

    async getUserPlaylists(userId: number) {
        const data: any = await this.request(userId, 'GET', '/me/playlists', { limit: 50 });
        return data.items;
    }

    // ✅ RECUPERADO: TRACKS DE UNA PLAYLIST ESPECÍFICA
    async getPlaylistTracks(userId: number, playlistId: string) {
        return this.request(userId, 'GET', `/playlists/${playlistId}`);
    }

    async getSavedTracks(userId: number, offset = 0) {
        return this.request(userId, 'GET', '/me/tracks', { limit: 50, offset });
    }

    async checkIsSaved(userId: number, trackId: string) {
        const data: any = await this.request(userId, 'GET', '/me/tracks/contains', { ids: trackId });
        return data[0];
    }

    async saveTrack(userId: number, id: string) {
        return this.request(userId, 'PUT', '/me/tracks', { ids: id });
    }

    async removeTrack(userId: number, id: string) {
        return this.request(userId, 'DELETE', '/me/tracks', { ids: id });
    }

    async getTopTracks(userId: number) {
        try {
            const data: any = await this.request(userId, 'GET', '/me/top/tracks', { limit: 10 });
            return data.items;
        } catch { return []; }
    }

    async getRecentlyPlayed(userId: number) {
        try {
            const data: any = await this.request(userId, 'GET', '/me/player/recently-played', { limit: 50 });
            const uniqueItems: any[] = [];
            const seenUris = new Set();
            for (const item of data.items) {
                const uri = item.context ? item.context.uri : item.track.album.uri;
                if (!seenUris.has(uri)) {
                    seenUris.add(uri);
                    uniqueItems.push({
                        id: uri,
                        name: item.context ? item.track.album.name : item.track.name,
                        image: item.track.album.images[0]?.url,
                        uri: uri,
                        type: item.context ? item.context.type : 'album'
                    });
                }
                if (uniqueItems.length >= 7) break;
            }
            return uniqueItems;
        } catch { return []; }
    }

    // --- ARTISTAS & FOLLOWS ---

    async getArtist(id: string, userId: number) {
        return this.getCached(userId, `artist-${id}`, 3600, () => 
            // Pasamos '1' al final para que solo intente 1 vez
            this.request(userId, 'GET', `/artists/${id}`, {}, null, {}, 1) 
        );
    }

    async getArtistTopTracks(userId: number, artistId: string) {
        try {
            const data: any = await this.request(userId, 'GET', `/artists/${artistId}/top-tracks`, { market: 'ES' });
            return data.tracks;
        } catch { return []; }
    }

    async checkUserFollowsArtist(userId: number, artistId: string) {
        return this.getCached(userId, `follows-${artistId}`, 300, async () => {
            const data: any = await this.request(userId, 'GET', '/me/following/contains', { type: 'artist', ids: artistId }, null, {}, 0);
            return data[0];
        }).catch(() => false);
    }

    async followArtist(userId: number, artistId: string) {
        await this.request(userId, 'PUT', '/me/following', { type: 'artist', ids: artistId });
        this.cache.set(`${userId}:follows-${artistId}`, { data: true, expiresAt: Date.now() + 300000 });
        return { success: true };
    }

    async unfollowArtist(userId: number, artistId: string) {
        await this.request(userId, 'DELETE', '/me/following', { type: 'artist', ids: artistId });
        this.cache.set(`${userId}:follows-${artistId}`, { data: false, expiresAt: Date.now() + 300000 });
        return { success: true };
    }

    // --- BUSCADOR & CATEGORÍAS ---

    async search(userId: number, query: string) {
        if (!query) return null;
        return this.request(userId, 'GET', '/search', { q: query, type: 'track,artist', limit: 10 });
    }

    async getCategories(userId: number) {
        return this.getCached(userId, 'categories', 3600, async () => {
            const country = await this.getUserRegion(userId);
            return this.request(userId, 'GET', '/browse/categories', { limit: 20, country, locale: 'es_ES' });
        });
    }

    async getCategoryPlaylists(userId: number, categoryId: string) {
        const country = await this.getUserRegion(userId);
        try {
            const data: any = await this.request(userId, 'GET', `/browse/categories/${categoryId}/playlists`, { limit: 20, country });
            return data.playlists.items;
        } catch (error: any) {
            if (error.response?.status === 404) return [];
            throw error;
        }
    }

    async getCategoryTracks(userId: number, categoryId: string) {
        return this.getCached(userId, `cat-tracks-${categoryId}`, 1800, async () => {
            const country = await this.getUserRegion(userId);
            let categoryName = categoryId;
            try {
                const cat: any = await this.request(userId, 'GET', `/browse/categories/${categoryId}`, { country, locale: 'es_ES' });
                categoryName = cat.name;
            } catch (e) {}

            try {
                const searchRes: any = await this.request(userId, 'GET', '/search', { 
                    q: `genre:"${categoryName}" OR "${categoryName}"`, 
                    type: 'track', limit: 50, market: country 
                });
                if (searchRes.tracks.items.length >= 5) return searchRes.tracks.items;
            } catch (e) {}

            let playlistId = null;
            try {
                const pRes: any = await this.request(userId, 'GET', `/browse/categories/${categoryId}/playlists`, { country, limit: 1 });
                if(pRes.playlists.items[0]) playlistId = pRes.playlists.items[0].id;
            } catch (e) {}

            if(!playlistId) {
                try {
                    const sRes: any = await this.request(userId, 'GET', '/search', { q: categoryName, type: 'playlist', limit: 1, market: country });
                    if(sRes.playlists.items[0]) playlistId = sRes.playlists.items[0].id;
                } catch(e) {}
            }

            if (playlistId) {
                try {
                    const tRes: any = await this.request(userId, 'GET', `/playlists/${playlistId}/tracks`, { limit: 50, market: country });
                    return tRes.items.map((i: any) => i.track).filter((t: any) => t);
                } catch (e) {}
            }
            return [];
        });
    }

    async getFeaturedPlaylists(userId: number) {
        const country = await this.getUserRegion(userId);
        try {
            const data: any = await this.request(userId, 'GET', '/search', { q: 'Top Hits author:spotify', type: 'playlist', market: country, limit: 15 });
            return data.playlists.items;
        } catch { return []; }
    }

    // --- PLAYLIST MANAGEMENT ---

    async createPlaylist(userId: number, name: string, description: string, imageBase64?: string) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user?.spotifyId) throw new UnauthorizedException('No user');

        const playlist: any = await this.request(userId, 'POST', `/users/${user.spotifyId}/playlists`, {}, {
            name, description, public: false
        });

        if (imageBase64) {
            try {
                await this.request(userId, 'PUT', `/playlists/${playlist.id}/images`, {}, imageBase64, { 'Content-Type': 'image/jpeg' });
            } catch (e) { console.error("Error subiendo imagen playlist", e); }
        }
        return playlist;
    }

    async editPlaylist(userId: number, playlistId: string, data: { name?: string; description?: string; image?: string }) {
        if (data.name || data.description) {
            await this.request(userId, 'PUT', `/playlists/${playlistId}`, {}, { name: data.name, description: data.description });
        }
        if (data.image) {
            await this.request(userId, 'PUT', `/playlists/${playlistId}/images`, {}, data.image, { 'Content-Type': 'image/jpeg' });
        }
        return { message: 'Playlist actualizada' };
    }

    async deletePlaylist(userId: number, playlistId: string) {
        await this.request(userId, 'DELETE', `/playlists/${playlistId}/followers`);
        return { message: 'Playlist eliminada' };
    }

    // --- EXTRAS ---

    async getVideo(query: string) {
        try {
            const searchResult = await ytSearch(query + " official video");
            const video = searchResult.videos[0];
            if (!video) return null;
            return { videoId: video.videoId, title: video.title, thumbnail: video.thumbnail, url: video.url };
        } catch { return null; }
    }

    async getAlbum(userId: number, albumId: string) {
        return this.request(userId, 'GET', `/albums/${albumId}`);
    }

    async getPublicUserProfile(userId: number, publicUserId: string) {
        return this.request(userId, 'GET', `/users/${publicUserId}`);
    }

    async getUserPublicPlaylists(userId: number, publicUserId: string) {
        try {
            const data: any = await this.request(userId, 'GET', `/users/${publicUserId}/playlists`, { limit: 20 });
            return data.items;
        } catch { return []; }
    }

    async getQueue(userId: number) {
        try {
            // Cambiamos el último parámetro de '0' a '1' para permitir 1 intento de renovación
            const data: any = await this.request(userId, 'GET', '/me/player/queue', {}, null, {}, 1);
            return data;
        } catch (error: any) {
            console.error("❌ ERROR QUEUE:", error.response?.data || error.message);
            return { queue: [] };
        }
    }

    // ==============================================================================
    // 4. MÉTODOS PRIVADOS DE SOPORTE
    // ==============================================================================

    private async getUserToken(userId: number) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user || !user.spotifyAccessToken) throw new UnauthorizedException('Usuario no conectado a Spotify');
        return user.spotifyAccessToken;
    }

    async refreshSpotifyToken(userId: number): Promise<string> {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user || !user.spotifyRefreshToken) throw new UnauthorizedException('No refresh token');

        const decryptedRefreshToken = decrypt(user.spotifyRefreshToken);
        const clientId = this.configService.get('SPOTIFY_CLIENT_ID');
        const clientSecret = this.configService.get('SPOTIFY_CLIENT_SECRET');
        const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

        try {
            const { data } = await axios.post('https://accounts.spotify.com/api/token', 
                new URLSearchParams({ grant_type: 'refresh_token', refresh_token: decryptedRefreshToken }), 
                { headers: { 'Authorization': `Basic ${basicAuth}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
            );

            await this.prisma.user.update({
                where: { id: userId },
                data: {
                    spotifyAccessToken: data.access_token,
                    spotifyRefreshToken: data.refresh_token ? encrypt(data.refresh_token) : undefined
                }
            });
            return data.access_token;
        } catch (error) {
            console.error("Error refreshing token", error);
            throw new InternalServerErrorException('No se pudo renovar el token');
        }
    }

    private async getUserRegion(userId: number): Promise<string> {
        return this.getCached(userId, 'region', 86400, async () => {
            try {
                const data: any = await this.request(userId, 'GET', '/me');
                return data.country || 'US';
            } catch { return 'US'; }
        });
    }

    
}