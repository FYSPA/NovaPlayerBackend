import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import axios from 'axios';
import ytSearch from 'yt-search';

@Injectable()
export class SpotifyService {
    constructor(private prisma: PrismaService) { }

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
    async getArtist(userId: number, artistId: string) {
        const token = await this.getUserToken(userId);
        try {
            const response = await axios.get(`https://api.spotify.com/v1/artists/${artistId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            return response.data;
        } catch (error) {
            console.error(error);
            throw new UnauthorizedException('Error cargando artista');
        }
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

    // 15. REPRODUCIR (INTELIGENTE)
    async play(userId: number, deviceId: string, uris: string[], contextUri?: string) {
        const token = await this.getUserToken(userId);
        try {
            let body = {};

            // Lógica:
            // 1. Si es Playlist -> Usamos Contexto + Offset (Mejor para listas largas)
            // 2. Si es Artista/Favoritos/Search -> Usamos la lista de URIs (Spotify no soporta offset en Artistas)
            
            const isPlaylist = contextUri?.includes('playlist');

            if (isPlaylist && uris.length === 1) {
                // Modo Playlist: Contexto + Offset
                body = {
                    context_uri: contextUri,
                    offset: { uri: uris[0] }
                };
            } else {
                // Modo Lista (Artista/Favoritos/Search): Mandamos el array de canciones
                // Spotify limita a unas 50 canciones por petición en el body, cortamos por seguridad
                body = { uris: uris.slice(0, 50) };
            }

            await axios.put(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, 
                body, 
                { headers: { Authorization: `Bearer ${token}` } }
            );
            return { success: true };
        } catch (error) {
            console.error("Error al reproducir:", error.response?.data);
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
            const response = await axios.get('https://api.spotify.com/v1/me/player/currently-playing', {
                headers: { Authorization: `Bearer ${token}` }
            });

            // Si no hay música sonando, Spotify devuelve 204 No Content (body vacío)
            if (response.status === 204 || !response.data || !response.data.item) {
                return null;
            }

            return {
                item: response.data.item,       // La canción
                is_playing: response.data.is_playing, // Si está pausada o no
                device_id: response.data.device?.id, // El dispositivo que suena
                progress_ms: response.data.progress_ms
            };
        } catch (error) {
            console.error("Error obteniendo currently playing", error);
            return null; // No lanzamos error para no romper el frontend
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
            console.log("Región detectada:", data.country); // Ej: MX, US, ES
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

        console.log(`Buscando playlists OFICIALES para: ${country}`);

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
}