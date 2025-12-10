import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) { // <--- ¡AQUÍ FALTA EL EXPORT!
    constructor() {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: process.env.JWT_SECRET || 'SECRETO_SUPER_SEGURO',
        });
    }

    async validate(payload: any) {
        return { userId: payload.sub, email: payload.email };
    }
}