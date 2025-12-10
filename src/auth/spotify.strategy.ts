import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-spotify';

@Injectable()
export class SpotifyStrategy extends PassportStrategy(Strategy, 'spotify') {
    constructor() {
        super({
            // CORRECCIÓN 1: Agregamos || '' para asegurar que sea string
            clientID: process.env.SPOTIFY_CLIENT_ID || '',
            clientSecret: process.env.SPOTIFY_CLIENT_SECRET || '',
            callbackURL: 'http://127.0.0.1:9000/auth/spotify/callback',
            scope: [
                'user-read-email',
                'user-read-private',
                'user-top-read',
                'user-library-read',
                'user-library-modify',
                'user-follow-read',
                'user-follow-modify',
                'playlist-read-private',
                'playlist-read-collaborative',
                'playlist-modify-public',
                'playlist-modify-private',
                'ugc-image-upload',
                'streaming',
                'user-read-playback-state',
                'user-modify-playback-state',
                'user-read-currently-playing'
            ],
        });
    }

    async validate(
        accessToken: string,
        refreshToken: string,
        profile: Profile,
        done: (err: any, user: any, info?: any) => void,
    ): Promise<any> {
        const { id, displayName, emails, photos } = profile;

        // CORRECCIÓN 2: Usamos ?. para evitar errores si emails viene vacío
        // Si no hay email, asignamos null o un string vacío para que no explote
        const userEmail = emails && emails[0] ? emails[0].value : null;

        if (!userEmail) {
            // Opcional: Si es obligatorio tener email, podrías lanzar un error aquí
            // return done(new Error('No email found from Spotify'), null);
        }
        const userPhoto = photos && photos.length > 0 ? (photos[0] as any).value : null;

        const user = {
            spotifyId: id,
            email: userEmail,
            name: displayName,
            image: userPhoto,
            accessToken,
            refreshToken,
        };

        done(null, user);
    }
}