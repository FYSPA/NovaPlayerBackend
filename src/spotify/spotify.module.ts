import { Module } from '@nestjs/common';
import { SpotifyService } from './spotify.service';
import { SpotifyController } from './spotify.controller';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from 'src/prisma.module';

@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [SpotifyService],
  controllers: [SpotifyController],
  exports: [SpotifyService],
})
export class SpotifyModule { }
