import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { PrismaModule } from './prisma.module'; // <--- 1. Importa el módulo nuevo
import { AuthModule } from './auth/auth.module';
import { SpotifyModule } from './spotify/spotify.module';

@Module({
  imports: [
    PrismaModule,
    UsersModule,
    AuthModule,
    SpotifyModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }