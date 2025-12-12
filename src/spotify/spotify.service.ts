import { Injectable, UnauthorizedException, HttpException, HttpStatus, InternalServerErrorException  } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import axios from 'axios';
import ytSearch from 'yt-search';
@Injectable()
export class SpotifyService {
    constructor(
        private prisma: PrismaService
    ) { }

    private async makeSpotifyRequest<T>(requestFn: () => Promise<T>, retries = 3): Promise<T> {
        try {
            return await requestFn();
        } catch (error) {
            if (axios.isAxiosError(error) && error.response) {
                const status = error.response.status;

                // CASO 1: RATE LIMIT (429)
                if (status === 429 && retries > 0) {
                    // Spotify nos dice cuánto esperar en el header 'retry-after' (en segundos)
                    // Si no viene, asumimos 2 segundos por defecto + 1 segundo extra de seguridad
                    const retryAfter = parseInt(error.response.headers['retry-after'] || '2', 10) + 1;
                    
                    console.warn(`⚠️ Spotify 429. Esperando ${retryAfter}s antes de reintentar...`);
                    
                    // Esperamos el tiempo que pide Spotify
                    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                    
                    // Reintentamos recursivamente (bajando el contador de intentos)
                    return this.makeSpotifyRequest(requestFn, retries - 1);
                }

                // CASO 2: TOKEN EXPIRADO (401)
                if (status === 401) {
                    // Aquí podrías implementar lógica de refresh token si la tuvieras
                    throw new UnauthorizedException('Token de Spotify expirado o inválido');
                }
            }
            
            // Si no es 429 o se acabaron los intentos, lanzamos el error
            throw error;
        }
    }

    // Función auxiliar para obtener el token del usuario desde la BD
    private async getUserToken(userId: number) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user || !user.spotifyAccessToken) {
            throw new UnauthorizedException('Usuario no conectado a Spotify');
        }
        return user.spotifyAccessToken;
    }

    // 1. OBTENER PLAYLISTS
    async getUserPlaylists(userId: number) {
        const token = await this.getUserToken(userId);

        try {
            const response = await axios.get('https://api.spotify.com/v1/me/playlists', {
                headers: { Authorization: `Bearer ${token}` },
            });
            return response.data.items;
        } catch (error) {
            console.error(error);
            throw new UnauthorizedException('Error al obtener playlists de Spotify');
        }
    }

    // 2. BUSCADOR
    async search(userId: number, query: string) {
        const token = await this.getUserToken(userId);

        try {
            // Buscamos canciones (track) y artistas
            const response = await axios.get(`https://api.spotify.com/v1/search?q=${query}&type=track,artist&limit=10`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            return response.data;
        } catch (error) {
            console.error(error);
            throw new UnauthorizedException('Error al buscar en Spotify');
        }
    }

    // 3. (EXTRA) TOP TRACKS DEL USUARIO
    async getTopTracks(userId: number) {
        const token = await this.getUserToken(userId);
        try {
            const response = await axios.get('https://api.spotify.com/v1/me/top/tracks?limit=10', {
                headers: { Authorization: `Bearer ${token}` },
            });
            return response.data.items;
        } catch (error) {
            return [];
        }
    }

    // 4. OBTENER CANCIONES DE UNA PLAYLIST
    async getPlaylistTracks(userId: number, playlistId: string) {
        const token = await this.getUserToken(userId);
        try {
            const response = await axios.get(`https://api.spotify.com/v1/playlists/${playlistId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            return response.data; // Devuelve info de la playlist + canciones
        } catch (error) {
            console.error(error);
            // Si falla, retornamos null o lanzamos error controlado
            throw new UnauthorizedException('Error al cargar la playlist');
        }
    }
    // 5. OBTENER CANCIONES GUARDADAS (FAVORITOS)
    async getSavedTracks(userId: number, offset: number = 0) {
        const token = await this.getUserToken(userId);
        try {
            // Pasamos el offset y el limit a Spotify
            const response = await axios.get('https://api.spotify.com/v1/me/tracks', {
                headers: { Authorization: `Bearer ${token}` },
                params: {
                    limit: 50,  // Máximo permitido por Spotify
                    offset: offset // Desde qué canción empezar (0, 50, 100...)
                }
            });
            return response.data;
        } catch (error) {
            console.error(error);
            throw new UnauthorizedException('Error al obtener favoritos');
        }
    }

    // 6. CREAR PLAYLIST
    async createPlaylist(userId: number, name: string, description: string, imageBase64?: string) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });

        if (!user || !user.spotifyAccessToken || !user.spotifyId) {
            throw new UnauthorizedException('Usuario no conectado a Spotify');
        }

        try {
            // 1. Crear la playlist
            const createUrl = `https://api.spotify.com/v1/users/${user.spotifyId}/playlists`;
            const createResponse = await axios.post(createUrl, {
                name: name,
                description: description,
                public: false
            }, {
                headers: { Authorization: `Bearer ${user.spotifyAccessToken}` }
            });

            const playlist = createResponse.data;

            // 2. Subir la imagen (Si el usuario envió una)
            if (imageBase64) {
                try {
                    const uploadUrl = `https://api.spotify.com/v1/playlists/${playlist.id}/images`;

                    // Spotify exige el body directo como string base64, y Content-Type image/jpeg
                    await axios.put(uploadUrl, imageBase64, {
                        headers: {
                            Authorization: `Bearer ${user.spotifyAccessToken}`,
                            'Content-Type': 'image/jpeg'
                        }
                    });
                } catch (imgError) {
                    console.error("Error subiendo imagen a Spotify:", imgError.response?.data || imgError);
                    // No lanzamos error para no cancelar la creación de la playlist, solo logueamos
                }
            }

            return playlist;
        } catch (error) {
            console.error("Error creando playlist:", error);
            throw new UnauthorizedException('No se pudo crear la playlist');
        }
    }
    // ... imports

    // 7. EDITAR PLAYLIST (Nombre, Descripción e Imagen)
    async editPlaylist(userId: number, playlistId: string, data: { name?: string; description?: string; image?: string }) {
        const token = await this.getUserToken(userId);
        try {
            // A. Actualizar Textos
            if (data.name || data.description) {
                await axios.put(`https://api.spotify.com/v1/playlists/${playlistId}`, {
                    name: data.name,
                    description: data.description,
                }, { headers: { Authorization: `Bearer ${token}` } });
            }

            // B. Actualizar Imagen (Si enviaron una nueva)
            if (data.image) {
                await axios.put(`https://api.spotify.com/v1/playlists/${playlistId}/images`, data.image, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'image/jpeg'
                    }
                });
            }
            return { message: 'Playlist actualizada' };
        } catch (error) {
            console.error("Error editando playlist", error);
            throw new UnauthorizedException('No se pudo editar la playlist');
        }
    }

    // 8. BORRAR PLAYLIST (En realidad es Unfollow)
    async deletePlaylist(userId: number, playlistId: string) {
        const token = await this.getUserToken(userId);
        try {
            await axios.delete(`https://api.spotify.com/v1/playlists/${playlistId}/followers`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            return { message: 'Playlist eliminada' };
        } catch (error) {
            console.error("Error borrando playlist", error);
            throw new UnauthorizedException('No se pudo eliminar la playlist');
        }
    }

    // 9. OBTENER DETALLES DEL ARTISTA
    async getArtist(id: string, userId: number) {
        const token = await this.getUserToken(userId);
        return this.makeSpotifyRequest(async () => {
            const { data } = await axios.get(`https://api.spotify.com/v1/artists/${id}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            return data;
        });
    }

    // 10. OBTENER TOP TRACKS DEL ARTISTA
    async getArtistTopTracks(userId: number, artistId: string) {
        const token = await this.getUserToken(userId);
        try {
            // Spotify exige el parámetro 'market' (país) para los Top Tracks
            const response = await axios.get(`https://api.spotify.com/v1/artists/${artistId}/top-tracks?market=ES`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            return response.data.tracks;
        } catch (error) {
            console.error(error);
            return [];
        }
    }

    // 11. VERIFICAR SI SIGUE AL ARTISTA
    async checkUserFollowsArtist(userId: number, artistId: string) {
        const token = await this.getUserToken(userId);
        try {
            const response = await axios.get(`https://api.spotify.com/v1/me/following/contains`, {
                headers: { Authorization: `Bearer ${token}` },
                params: { type: 'artist', ids: artistId }
            });
            // Spotify devuelve un array de booleanos [true] o [false]
            return response.data[0];
        } catch (error) {
            console.error(error);
            return false;
        }
    }

    // 12. SEGUIR ARTISTA
    async followArtist(userId: number, artistId: string) {
        const token = await this.getUserToken(userId);
        try {
            await axios.put(`https://api.spotify.com/v1/me/following?type=artist&ids=${artistId}`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            return { success: true };
        } catch (error) {
            throw new UnauthorizedException('No se pudo seguir al artista');
        }
    }

    // 13. DEJAR DE SEGUIR ARTISTA
    async unfollowArtist(userId: number, artistId: string) {
        const token = await this.getUserToken(userId);
        try {
            await axios.delete(`https://api.spotify.com/v1/me/following?type=artist&ids=${artistId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            return { success: true };
        } catch (error) {
            throw new UnauthorizedException('No se pudo dejar de seguir');
        }
    }

    // 14. OBTENER TOKEN DE ACCESO (Para el SDK del Frontend)
    async getAccessToken(userId: number) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user || !user.spotifyAccessToken) {
            throw new UnauthorizedException('Usuario no conectado a Spotify');
        }
        return { token: user.spotifyAccessToken };
    }

    // 15. REPRODUCIR
    async play(userId: number, deviceId: string, uris: string[], contextUri?: string) {
        const token = await this.getUserToken(userId);
        try {
            let body: any = {};

            // ESCENARIO A: Reproducir un Contexto (Playlist o Album)
            if (contextUri) {
                body.context_uri = contextUri;

                // --- CORRECCIÓN CRÍTICA AQUÍ ---
                // Solo agregamos offset si hay elementos Y el primero es un string válido
                if (Array.isArray(uris) && uris.length > 0 && typeof uris[0] === 'string' && uris[0].includes('spotify:track:')) {
                    body.offset = { uri: uris[0] };
                }
                // Si uris es [] (vacío), NO agregamos 'offset'. 
                // Así Spotify entiende: "Reproduce este álbum desde el principio".
            } 
            
            // ESCENARIO B: Lista de canciones
            else if (Array.isArray(uris) && uris.length > 0) {
                body.uris = uris.slice(0, 50);
            }

            console.log("Enviando a Spotify:", JSON.stringify(body, null, 2));

            await axios.put(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, 
                body, 
                { headers: { Authorization: `Bearer ${token}` } }
            );
            return { success: true };
        } catch (error) {
            console.error("Error Spotify Play:", error.response?.data?.error || error.message)
            // No lanzamos error fatal para que el frontend pueda intentar transferir el playback si falla
            throw new UnauthorizedException('No se pudo reproducir');
        }
    }

    // 16. TRANSFERIR REPRODUCCIÓN (Cambiar dispositivo)
    async transfer(userId: number, deviceId: string) {
        const token = await this.getUserToken(userId);
        try {
            await axios.put(`https://api.spotify.com/v1/me/player`,
                { device_ids: [deviceId], play: true },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            return { success: true };
        } catch (error) {
            console.error("Error al transferir:", error.response?.data);
            throw new UnauthorizedException('No se pudo transferir');
        }
    }
    // 17. OBTENER LO QUE SUENA ACTUALMENTE (Para sincronizar al inicio)
    async getCurrentlyPlaying(userId: number) {
        const token = await this.getUserToken(userId);
        try {
            const { data } = await axios.get('https://api.spotify.com/v1/me/player/currently-playing', {
                headers: { Authorization: `Bearer ${token}` },
            });
            return data;
        } catch (error) {
            // --- CORRECCIÓN AQUÍ ---
            if (axios.isAxiosError(error)) {
                // Si es error 429 (Rate Limit), devolvemos null tranquilamente
                // Esto hace que el frontend simplemente no actualice la barra por un segundo
                if (error.response?.status === 429) {
                    console.warn(`Spotify Rate Limit (429). Esperando...`);
                    return null; 
                }
                // Si el token expiró (401), intentamos refrescarlo (si tienes esa lógica) o lanzamos error
                if (error.response?.status === 401) {
                    // Aquí podrías poner tu lógica de refresh token si la tienes
                    throw new UnauthorizedException('Token de Spotify expirado');
                }
            }
            // Si es otro error, lo dejamos pasar o retornamos null para que no rompa
            console.error("Error obteniendo currently playing:", error.message);
            return null; 
        }
    }

    // 18. SEEK (Saltar a un tiempo específico)
    async seek(userId: number, positionMs: number, deviceId: string) {
        const token = await this.getUserToken(userId);
        try {
            await axios.put(`https://api.spotify.com/v1/me/player/seek?position_ms=${positionMs}&device_id=${deviceId}`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            return { success: true };
        } catch (error) {
            console.error("Error al buscar posición", error);
            throw new UnauthorizedException('No se pudo saltar en la canción');
        }
    }
    // 19. PAUSAR
    async pause(userId: number, deviceId: string) {
        const token = await this.getUserToken(userId);
        try {
            await axios.put(`https://api.spotify.com/v1/me/player/pause?device_id=${deviceId}`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            return { success: true };
        } catch (error) {
            // Si ya estaba pausado, Spotify a veces da error, lo ignoramos
            return { success: false };
        }
    }

    // 20. REANUDAR (RESUME)
    async resume(userId: number, deviceId: string) {
        const token = await this.getUserToken(userId);
        try {
            await axios.put(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            return { success: true };
        } catch (error) {
            throw new UnauthorizedException('No se pudo reanudar');
        }
    }

    // 21. SIGUIENTE CANCIÓN
    async next(userId: number, deviceId: string) {
        const token = await this.getUserToken(userId);
        try {
            await axios.post(`https://api.spotify.com/v1/me/player/next?device_id=${deviceId}`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            return { success: true };
        } catch (error) {
            throw new UnauthorizedException('No se pudo saltar canción');
        }
    }

    // 22. ANTERIOR CANCIÓN
    async previous(userId: number, deviceId: string) {
        const token = await this.getUserToken(userId);
        try {
            await axios.post(`https://api.spotify.com/v1/me/player/previous?device_id=${deviceId}`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            return { success: true };
        } catch (error) {
            throw new UnauthorizedException('No se pudo retroceder');
        }
    }

    // 23. CAMBIAR VOLUMEN
    async setVolume(userId: number, volumePercent: number, deviceId: string) {
        const token = await this.getUserToken(userId);
        try {
            await axios.put(`https://api.spotify.com/v1/me/player/volume?volume_percent=${volumePercent}&device_id=${deviceId}`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            return { success: true };
        } catch (error) {
            // A veces falla si el dispositivo no soporta cambio de volumen remoto, no lanzamos error crítico
            console.error("Error cambiando volumen", error?.response?.data);
            return { success: false };
        }
    }
    // 24. VERIFICAR SI LA CANCIÓN ESTÁ EN FAVORITOS
    async checkIsSaved(userId: number, trackId: string) {
        const token = await this.getUserToken(userId);
        try {
            const response = await axios.get(`https://api.spotify.com/v1/me/tracks/contains?ids=${trackId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            return response.data[0]; // Devuelve true o false
        } catch (error) {
            return false;
        }
    }

    // 25. GUARDAR CANCIÓN (LIKE)
    async saveTrack(userId: number, trackId: string) {
        const token = await this.getUserToken(userId);
        await axios.put(`https://api.spotify.com/v1/me/tracks?ids=${trackId}`, {}, {
            headers: { Authorization: `Bearer ${token}` }
        });
        return { success: true };
    }

    // 26. BORRAR CANCIÓN (DISLIKE)
    async removeTrack(userId: number, trackId: string) {
        const token = await this.getUserToken(userId);
        await axios.delete(`https://api.spotify.com/v1/me/tracks?ids=${trackId}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        return { success: true };
    }


    // 27. RECUPERAR LOS VIDEOS
    async getVideo(query: string) {
        try {
            // Buscamos "Nombre Canción + Artista + Official Video"
            const searchResult = await ytSearch(query + " official video");

            // Tomamos el primer resultado que sea un video
            const video = searchResult.videos.length > 0 ? searchResult.videos[0] : null;

            if (!video) return null;

            return {
                videoId: video.videoId,
                title: video.title,
                thumbnail: video.thumbnail,
                url: video.url
            };
        } catch (error) {
            console.error("Error buscando video", error);
            return null;
        }
    }

    // 28. OBTENER LA REGION DEL USUARIO
    private async getUserRegion(token: string): Promise<string> {
        try {
            // Llamamos al perfil del usuario (/me) que contiene el campo "country"
            const { data } = await axios.get('https://api.spotify.com/v1/me', {
                headers: { Authorization: `Bearer ${token}` }
            });
            return data.country || 'US'; // Si falla, usamos US por defecto
        } catch (error) {
            return 'US';
        }
    }

    // 28.5. ACTUALIZADO: OBTENER PLAYLISTS DE SPOTIFY (BASADO EN REGIÓN)
    // src/spotify/spotify.service.ts

    async getFeaturedPlaylists(userId: number) {
        const token = await this.getUserToken(userId);
        const country = await this.getUserRegion(token);


        try {
            // TRUCO PRO: Usamos "author:spotify" en la búsqueda.
            // Esto obliga a la API a devolver SOLO playlists creadas por Spotify.
            // Probamos buscando "Top", "Hits" o "Pop" combinados con el autor.

            const query = 'Top Hits author:spotify';
            // O si prefieres en español: const query = 'Éxitos author:spotify';

            const response = await axios.get('https://api.spotify.com/v1/search', {
                headers: { Authorization: `Bearer ${token}` },
                params: {
                    q: query,
                    type: 'playlist',
                    market: country, // Para que sean relevantes en tu país
                    limit: 15
                }
            });

            // Aquí ya vienen filtradas desde el servidor de Spotify
            return response.data.playlists.items;

        } catch (error) {
            console.error("Error buscando playlists oficiales:", error.response?.data || error.message);
            return [];
        }
    }

    // 29. OBTENER PERFIL PÚBLICO DE USUARIO
    async getPublicUserProfile(userId: number, publicUserId: string) {
        const token = await this.getUserToken(userId);
        try {
            const response = await axios.get(`https://api.spotify.com/v1/users/${publicUserId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            return response.data;
        } catch (error) {
            console.error("Error buscando usuario:", error);
            throw new UnauthorizedException('Usuario no encontrado');
        }
    }

    // 30. OBTENER PLAYLISTS PÚBLICAS DE UN USUARIO
    async getUserPublicPlaylists(userId: number, publicUserId: string) {
        const token = await this.getUserToken(userId);
        try {
            const response = await axios.get(`https://api.spotify.com/v1/users/${publicUserId}/playlists`, {
                headers: { Authorization: `Bearer ${token}` },
                params: { limit: 20 }
            });
            return response.data.items;
        } catch (error) {
            return [];
        }
    }

    // 31. OBTENER RECIÉN ESCUCHADO (Quick Access)
    async getRecentlyPlayed(userId: number) {
        const token = await this.getUserToken(userId);
        try {
            const response = await axios.get('https://api.spotify.com/v1/me/player/recently-played?limit=50', {
                headers: { Authorization: `Bearer ${token}` }
            });

            // LOGICA PARA FILTRAR DUPLICADOS Y EXTRAER CONTEXTOS
            // Spotify devuelve canciones individuales. Nosotros queremos agrupar por "Contexto" (Album o Playlist)
            const history = response.data.items;
            const uniqueItems: any[] = [];
            const seenUris = new Set();

            for (const item of history) {
                // El contexto es la Playlist o el Album desde donde sonó
                const context = item.context; 
                const track = item.track;

                // Si no tiene contexto (ej. single suelto), usamos el álbum
                const uri = context ? context.uri : track.album.uri;
                const type = context ? context.type : 'album';
                
                // Si ya agregamos este contexto, lo saltamos
                if (seenUris.has(uri)) continue;
                seenUris.add(uri);

                // IMPORTANTE: El endpoint de historial NO devuelve la foto de la playlist.
                // Usamos la foto del álbum de la canción como "representación" visual.
                uniqueItems.push({
                    id: uri, // Usamos el URI como ID único
                    name: context ? track.album.name : track.name, // Nombre representativo
                    image: track.album.images[0]?.url,
                    uri: uri,
                    type: type
                });

                if (uniqueItems.length >= 7) break; // Solo queremos 7 (+1 de Liked Songs)
            }

            return uniqueItems;

        } catch (error) {
            console.error("Error historial", error);
            return [];
        }
    }

    // 29. OBTENER ÁLBUM
    async getAlbum(userId: number, albumId: string) {
        const token = await this.getUserToken(userId);
        try {
            const response = await axios.get(`https://api.spotify.com/v1/albums/${albumId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            return response.data;
        } catch (error) {
            console.error(error);
            throw new UnauthorizedException('Error cargando álbum');
        }
    }
}