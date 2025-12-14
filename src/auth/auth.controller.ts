import { Controller, Get, UseGuards, Req, Res, Post, HttpCode, HttpStatus, Body } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import express from 'express';
import { SpotifyService } from '../spotify/spotify.service';
import { Throttle } from '@nestjs/throttler'; 
import { LoginDto } from './dto/login.dto'; 

@Controller('auth')
export class AuthController {
    constructor(
        private authService: AuthService,
        private readonly spotifyService: SpotifyService
    ) { }

    @Throttle({ default: { limit: 5, ttl: 60000 } }) 
    @Post('login')
    async login(@Body() loginDto: LoginDto) {
        return this.authService.login(loginDto.email, loginDto.password);
    }


    @Post('forgot-password')
    async forgotPassword(@Body() body: { email: string }) {
        return this.authService.forgotPassword(body.email);
    }

    @Post('reset-password')
    async resetPassword(@Body() body: { token: string; newPassword: string }) {
        return this.authService.resetPassword(body.token, body.newPassword);
    }

    // 1. Ruta que inicia el login (el usuario hace clic aquí)
    @Get('spotify')
    @UseGuards(AuthGuard('spotify'))
    async spotifyAuth() {
        // Passport redirige automáticamente a Spotify
    }

    // 2. Ruta de Callback (Spotify regresa aquí)
    @Get('spotify/callback')
    @UseGuards(AuthGuard('spotify'))
    async spotifyAuthRedirect(@Req() req: any, @Res() res: express.Response) {
        // 'req.user' viene del método validate() de la estrategia
        const user = await this.authService.validateSpotifyUser(req.user);

        // Generamos el JWT de nuestra app
        const jwt = await this.authService.generateJwt(user);

        // 3. REDIRECCIÓN AL FRONTEND
        // Como el backend no puede guardar en localStorage del front,
        // redirigimos al front pasando el token en la URL.
        res.redirect(`http://localhost:3001/callback?token=${jwt.access_token}`);
    }

    @UseGuards(AuthGuard('jwt'))
    @Get('me')
    async getProfile(@Req() req) {
        // req.user tiene el userId gracias a tu JwtStrategy
        // Llamamos a Prisma para buscar los datos frescos
        return this.authService.getUserProfile(req.user.userId);
    }
    
    @UseGuards(AuthGuard('jwt'))
    @Post('refresh-spotify')
    async refreshSpotifyToken(@Req() req) {
        console.log(`🔄 Frontend solicitó renovación manual para usuario ${req.user.userId}`);
        
        const accessToken = await this.spotifyService.refreshSpotifyToken(req.user.userId);
        
        // Devolvemos el token en un objeto JSON
        return { accessToken };
    }

    
}