import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-spotify';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SpotifyStrategy extends PassportStrategy(Strategy, 'spotify') {
  // 2. INYECTAR EL SERVICIO EN EL CONSTRUCTOR
  constructor(configService: ConfigService) {
    super({
      // 3. USAR configService.get() EN LUGAR DE process.env
      clientID: configService.get<string>('SPOTIFY_CLIENT_ID') || '',
      clientSecret: configService.get<string>('SPOTIFY_CLIENT_SECRET') || '',
      callbackURL: 'http://127.0.0.1:9000/auth/spotify/callback',
      scope: [
        'user-read-email', 
        'user-read-private',
        'user-top-read',
        'user-library-read',
        'user-library-modify',
        'playlist-modify-public',
        'playlist-modify-private',
        'playlist-read-private',
        'playlist-read-collaborative',
        'ugc-image-upload',
        'user-follow-read',
        'user-follow-modify',
        'streaming',
        'user-read-playback-state',  
        'user-modify-playback-state',
        'user-read-currently-playing',
        'user-read-recently-played',
      ],
      showDialog: true, 
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: (err: any, user: any, info?: any) => void,
  ): Promise<any> {
    const { id, displayName, emails, photos } = profile;
    
    // Recuerda usar 'as any' aquí como arreglamos antes
    const userPhoto = photos && photos.length > 0 ? (photos[0] as any).value : null;
    
    const userEmail = emails && emails[0] ? emails[0].value : null;

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