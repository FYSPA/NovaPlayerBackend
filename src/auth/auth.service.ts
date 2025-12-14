import { Injectable, NotFoundException, UnauthorizedException, BadRequestException, InternalServerErrorException  } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from 'src/prisma.service'; // Asegura que la ruta sea correcta
import * as nodemailer from 'nodemailer';
import { encrypt } from '../utils/crypto.util'; 

@Injectable()
export class AuthService {
    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService,
    ) { }

    


    async forgotPassword(email: string) {
        const user = await this.prisma.user.findUnique({ where: { email } });
        if (!user) throw new NotFoundException('Usuario no encontrado');

        // Generar token aleatorio (puedes usar uuid, o math random simple)
        const token = Math.floor(10000000 + Math.random() * 90000000).toString();

        // Configurar expiración (1 hora desde ahora)
        const expiry = new Date();
        expiry.setHours(expiry.getHours() + 1);

        // Guardar en base de datos
        await this.prisma.user.update({
            where: { email },
            data: {
                resetToken: token,
                resetTokenExpiry: expiry,
            },
        });

        // Enviar correo (Configura tu transporter igual que en register)
        // RECOMIENDO MOVER LA CREACIÓN DEL TRANSPORTER A UN ARCHIVO APARTE PARA NO REPETIR CÓDIGO
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
        });

        // La URL apuntará a tu Frontend
        const resetUrl = `http://localhost:3001/reset-password?token=${token}`;

        await transporter.sendMail({
            from: '"My Music App" <no-reply@musicapp.com>',
            to: email,
            subject: 'Recuperar Contraseña',
            html: `
            <h3>Has solicitado restablecer tu contraseña</h3>
            <p>Haz clic en el siguiente enlace para crear una nueva:</p>
            <a href="${resetUrl}">Restablecer Contraseña</a>
            <p>Este enlace expira en 1 hora.</p>
        `,
        });

        return { message: 'Email sent. Check your inbox.' };
    }

    // 2. ESTABLECER NUEVA CONTRASEÑA
    async resetPassword(token: string, newPassword: string) {
        // Buscar usuario que tenga ese token
        const user = await this.prisma.user.findFirst({
            where: { resetToken: token },
        });

        if (!user) throw new BadRequestException('Invalid or expired token');

        // Verificar si el token expiró
        if (!user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
            throw new BadRequestException('Token has expired');
        }

        // Hashear la nueva contraseña
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Actualizar usuario y limpiar el token
        await this.prisma.user.update({
            where: { id: user.id },
            data: {
                password: hashedPassword,
                resetToken: null,       // Borrar token usado
                resetTokenExpiry: null, // Borrar fecha
            },
        });

        return { message: 'Password updated successfully' };
    }


    // 1. Validar Usuario (Login)
    async login(email: string, pass: string) {
        // A. Buscar usuario
        const user = await this.prisma.user.findUnique({ where: { email } });

        if (!user) {
            throw new UnauthorizedException('Incorrect credentials');
        }

        if (!user.password) {
            throw new UnauthorizedException('Esta cuenta se registró con Spotify. Por favor inicia sesión con Spotify.');
        }

        // B. Verificar si ya validó su correo (¡Importante!)
        if (!user.isVerified) {
            throw new UnauthorizedException('You must verify your email before logging in.');
        }

        // C. Comparar contraseñas (La que envía vs La encriptada en BD)
        const isMatch = await bcrypt.compare(pass, user.password);

        if (!isMatch) {
            throw new UnauthorizedException('Incorrect credentials');
        }

        // D. Generar el Token JWT
        const payload = { sub: user.id, email: user.email, name: user.name };

        return {
            access_token: await this.jwtService.signAsync(payload),
            user: {
                id: user.id,
                email: user.email,
                name: user.name
            }
        };
    }

    // ... imports

    async validateSpotifyUser(details: {
        spotifyId: string;
        email: string;
        name: string;
        image: string;
        accessToken: string;
        refreshToken: string
    }) {

        // 1. Buscamos al usuario (por Spotify ID o por Email)
        let user = await this.prisma.user.findFirst({
            where: {
                OR: [
                    { spotifyId: details.spotifyId },
                    { email: details.email }
                ]
            }
        });

        if (user) {
            user = await this.prisma.user.update({
                where: { id: user.id }, // Usamos el ID interno para ser más seguros
                data: {
                    spotifyId: details.spotifyId,
                    image: details.image,
                    // ¡ESTAS DOS LÍNEAS FALTABAN O NO SE ACTUALIZABAN!
                    spotifyAccessToken: details.accessToken,
                    spotifyRefreshToken: details.refreshToken ? encrypt(details.refreshToken) : user.spotifyRefreshToken,
                },
            });
        } else {
            // Si NO existe, lo creamos
            user = await this.prisma.user.create({
                data: {
                    email: details.email,
                    name: details.name,
                    spotifyId: details.spotifyId,
                    image: details.image,
                    spotifyAccessToken: details.accessToken,
                    spotifyRefreshToken: details.refreshToken ? encrypt(details.refreshToken) : null,
                    isVerified: true,
                    password: null,
                },
            });
        }

        return user;
    }

    // Método auxiliar para generar JWT (Reutilízalo si ya lo tienes dentro de login)
    async generateJwt(user: any) {
        const payload = { sub: user.id, email: user.email };
        return {
            access_token: await this.jwtService.signAsync(payload),
            user: {
                id: user.id,
                email: user.email,
                name: user.name
            }
        };
    }

    // Agrega esto en AuthService
    async getUserProfile(userId: number) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            // Seleccionamos solo lo que queremos mostrar (por seguridad no devolvemos password)
            select: {
                id: true,
                name: true,
                email: true,
                image: true,
                spotifyId: true,
            }
        });
        return user;
    }
}