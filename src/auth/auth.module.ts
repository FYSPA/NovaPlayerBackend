import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PrismaService } from '../prisma.service';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { SpotifyStrategy } from './spotify.strategy';
import { JwtStrategy } from './jwt.strategy';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || 'SECRETO_SUPER_SEGURO', 
      signOptions: { expiresIn: '1h' },
    }),
  ],
  controllers: [AuthController],
  providers: [
    PrismaService,
    AuthService,
    SpotifyStrategy,
    JwtStrategy

  ],
})
export class AuthModule { }