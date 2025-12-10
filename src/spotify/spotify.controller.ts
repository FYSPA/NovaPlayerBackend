import { Controller, Get, Query, Req, UseGuards, Post, Body, Put, Delete } from '@nestjs/common';
import { SpotifyService } from './spotify.service';
import { AuthGuard } from '@nestjs/passport';
import { Param } from '@nestjs/common';

@Controller('spotify')
export class SpotifyController {
    constructor(private readonly spotifyService: SpotifyService) { }

    // CORRECCIÓN 1: Agrega ('jwt') dentro de AuthGuard
    @UseGuards(AuthGuard('jwt'))
    @Get('playlists')
    async getPlaylists(@Req() req) {
        // CORRECCIÓN 2: En tu JwtStrategy pusimos 'userId', no 'id'
        // Si usas req.user.id te saldrá undefined.
        return this.spotifyService.getUserPlaylists(req.user.userId);
    }

    @UseGuards(AuthGuard('jwt')) // <--- AQUÍ TAMBIÉN
    @Get('search')
    async search(@Req() req, @Query('q') query: string) {
        return this.spotifyService.search(req.user.userId, query); // <--- userId
    }

    @UseGuards(AuthGuard('jwt')) // <--- AQUÍ TAMBIÉN
    @Get('top-tracks')
    async getTopTracks(@Req() req) {
        return this.spotifyService.getTopTracks(req.user.userId); // <--- userId
    }

    @UseGuards(AuthGuard('jwt'))
    @Get('playlist/:id') // Ruta: /spotify/playlist/37i9dQZF1DXcBWIGoYBM5M
    async getPlaylist(@Req() req, @Param('id') id: string) {
        return this.spotifyService.getPlaylistTracks(req.user.userId, id);
    }

    @UseGuards(AuthGuard('jwt'))
    @Get('saved-tracks')
    // Leemos el query param ?offset=...
    async getSavedTracks(@Req() req, @Query('offset') offset?: string) {
        // Convertimos a número (si no viene, es 0)
        const offsetNumber = offset ? parseInt(offset) : 0;
        return this.spotifyService.getSavedTracks(req.user.userId, offsetNumber);
    }

    @UseGuards(AuthGuard('jwt'))
    @Post('playlist')
    async createPlaylist(@Req() req, @Body() body: { name: string; description?: string; image?: string }) {
        // Pasamos la imagen al servicio
        return this.spotifyService.createPlaylist(req.user.userId, body.name, body.description || "", body.image);
    }

    @UseGuards(AuthGuard('jwt'))
    @Put('playlist/:id')
    async editPlaylist(@Req() req, @Param('id') id: string, @Body() body: any) {
        return this.spotifyService.editPlaylist(req.user.userId, id, body);
    }

    @UseGuards(AuthGuard('jwt'))
    @Delete('playlist/:id')
    async deletePlaylist(@Req() req, @Param('id') id: string) {
        return this.spotifyService.deletePlaylist(req.user.userId, id);
    }

    @UseGuards(AuthGuard('jwt'))
    @Get('artist/:id')
    async getArtist(@Req() req, @Param('id') id: string) {
        return this.spotifyService.getArtist(req.user.userId, id);
    }

    @UseGuards(AuthGuard('jwt'))
    @Get('artist/:id/top-tracks')
    async getArtistTopTracks(@Req() req, @Param('id') id: string) {
        return this.spotifyService.getArtistTopTracks(req.user.userId, id);
    }

    @UseGuards(AuthGuard('jwt'))
    @Get('artist/:id/is-following')
    async checkFollow(@Req() req, @Param('id') id: string) {
        return this.spotifyService.checkUserFollowsArtist(req.user.userId, id);
    }

    @UseGuards(AuthGuard('jwt'))
    @Put('artist/:id/follow')
    async followArtist(@Req() req, @Param('id') id: string) {
        return this.spotifyService.followArtist(req.user.userId, id);
    }

    @UseGuards(AuthGuard('jwt'))
    @Delete('artist/:id/follow')
    async unfollowArtist(@Req() req, @Param('id') id: string) {
        return this.spotifyService.unfollowArtist(req.user.userId, id);
    }

    @UseGuards(AuthGuard('jwt'))
    @Get('token')
    async getToken(@Req() req) {
        return this.spotifyService.getAccessToken(req.user.userId);
    }

    @UseGuards(AuthGuard('jwt'))
    @Put('play')
    async play(@Req() req, @Body() body: { deviceId: string; uri: string }) {
        return this.spotifyService.play(req.user.userId, body.deviceId, body.uri);
    }

    @UseGuards(AuthGuard('jwt'))
    @Put('transfer')
    async transfer(@Req() req, @Body() body: { deviceId: string }) {
        return this.spotifyService.transfer(req.user.userId, body.deviceId);
    }

    @UseGuards(AuthGuard('jwt'))
    @Get('currently-playing')
    async getCurrentlyPlaying(@Req() req) {
        return this.spotifyService.getCurrentlyPlaying(req.user.userId);
    }

    @UseGuards(AuthGuard('jwt'))
    @Put('seek')
    async seek(@Req() req, @Body() body: { positionMs: number; deviceId: string }) {
        return this.spotifyService.seek(req.user.userId, body.positionMs, body.deviceId);
    }

    @UseGuards(AuthGuard('jwt'))
    @Put('pause')
    async pause(@Req() req, @Body() body: { deviceId: string }) {
        return this.spotifyService.pause(req.user.userId, body.deviceId);
    }

    @UseGuards(AuthGuard('jwt'))
    @Put('resume')
    async resume(@Req() req, @Body() body: { deviceId: string }) {
        return this.spotifyService.resume(req.user.userId, body.deviceId);
    }

    @UseGuards(AuthGuard('jwt'))
    @Post('next')
    async next(@Req() req, @Body() body: { deviceId: string }) {
        return this.spotifyService.next(req.user.userId, body.deviceId);
    }

    @UseGuards(AuthGuard('jwt'))
    @Post('previous')
    async previous(@Req() req, @Body() body: { deviceId: string }) {
        return this.spotifyService.previous(req.user.userId, body.deviceId);
    }

    @UseGuards(AuthGuard('jwt'))
    @Put('volume')
    async setVolume(@Req() req, @Body() body: { volumePercent: number; deviceId: string }) {
        return this.spotifyService.setVolume(req.user.userId, body.volumePercent, body.deviceId);
    }
    @UseGuards(AuthGuard('jwt'))
    @Get('check-saved/:id')
    async checkSaved(@Req() req, @Param('id') id: string) {
        return this.spotifyService.checkIsSaved(req.user.userId, id);
    }

    @UseGuards(AuthGuard('jwt'))
    @Put('save-track/:id')
    async saveTrack(@Req() req, @Param('id') id: string) {
        return this.spotifyService.saveTrack(req.user.userId, id);
    }

    @UseGuards(AuthGuard('jwt'))
    @Delete('remove-track/:id')
    async removeTrack(@Req() req, @Param('id') id: string) {
        return this.spotifyService.removeTrack(req.user.userId, id);
    }

    @UseGuards(AuthGuard('jwt'))
    @Get('video')
    async getVideo(@Query('q') query: string) {
        return this.spotifyService.getVideo(query);
    }

    @UseGuards(AuthGuard('jwt'))
    @Get('featured')
    async getFeaturedPlaylists(@Req() req) {
        return this.spotifyService.getFeaturedPlaylists(req.user.userId);
    }

    @UseGuards(AuthGuard('jwt'))
    @Get('user-profile/:id')
    async getPublicProfile(@Req() req, @Param('id') id: string) {
        return this.spotifyService.getPublicUserProfile(req.user.userId, id);
    }

    @UseGuards(AuthGuard('jwt'))
    @Get('user-profile/:id/playlists')
    async getPublicPlaylists(@Req() req, @Param('id') id: string) {
        return this.spotifyService.getUserPublicPlaylists(req.user.userId, id);
    }
}