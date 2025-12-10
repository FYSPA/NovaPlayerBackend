import { Controller, Get, UseGuards, Req, Res, Post, HttpCode, HttpStatus, Body } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import express from 'express';


@Controller('auth')
export class AuthController {
    constructor(private authService: AuthService) { }

    @HttpCode(HttpStatus.OK)
    @Post('login')
    login(@Body() signInDto: Record<string, any>) {
        return this.authService.login(signInDto.email, signInDto.password);
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
}