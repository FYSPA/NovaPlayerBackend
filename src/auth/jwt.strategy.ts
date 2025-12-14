import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, InternalServerErrorException } from '@nestjs/common';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor() {
        const secret = process.env.JWT_SECRET;
        
        // SEGURIDAD: Si no hay secreto configurado, la app NO debe arrancar o debe fallar.
        if (!secret) {
            throw new Error("❌ ERROR CRÍTICO: JWT_SECRET no está definido en el archivo .env");
        }

        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: secret, // Usamos la variable validada
        });
    }

    async validate(payload: any) {
        return { userId: payload.sub, email: payload.email };
    }
}