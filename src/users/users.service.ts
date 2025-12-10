import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { PrismaService } from '../prisma.service';
import * as bcrypt from 'bcrypt';
import { UpdateUserDto } from './dto/update-user.dto';
import * as nodemailer from 'nodemailer';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) { }

  async create(createUserDto: CreateUserDto) {
    // 1. Generar código aleatorio de 6 dígitos
    const saltOrRounds = 10;
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedPassword = await bcrypt.hash(createUserDto.password, saltOrRounds);

    // 2. Crear el usuario en base de datos (guardando el código)
    const user = await this.prisma.user.create({
      data: {
        ...createUserDto,
        verificationToken: code,
        isVerified: false, // Por defecto no está verificado
        password: hashedPassword,
      },
    });

    // 3. Configurar el transporte de correo (Ejemplo con Gmail)
    // CAMBIA LOS DATOS POR LOS TUYOS
    const transporter = nodemailer.createTransport({
      service: 'gmail', // O 'hotmail', etc.
      auth: {
        user: process.env.EMAIL_USER, // <--- TU CORREO REAL
        pass: process.env.EMAIL_PASS, // <--- TU APP PASSWORD (No la normal)
      },
    });

    // 4. Enviar el correo
    await transporter.sendMail({
      from: '"Nova Player" <tu_correo@gmail.com>',
      to: user.email,
      subject: 'Verifica tu cuenta - Código de seguridad',
      text: `Hola ${user.name}, tu código de verificación es: ${code}`,
      html: `<b>Hola ${user.name}</b><br>Tu código de verificación es: <h1>${code}</h1>`,
    });

    return { message: 'Usuario creado. Revisa tu correo.', userId: user.id };
  }

  async verifyUser(email: string, code: string) {
    // 1. Buscar usuario por email
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    // 2. Verificar si el código coincide
    if (user.verificationToken !== code) {
      throw new BadRequestException('Código incorrecto');
    }

    // 3. Si coincide, actualizar usuario a Verificado y borrar el código
    await this.prisma.user.update({
      where: { email },
      data: {
        isVerified: true,
        verificationToken: null, // Borramos el código para que no se use de nuevo
      },
    });

    return { message: 'Cuenta verificada correctamente. Ya puedes iniciar sesión.' };
  }

  // Dejaremos estos métodos vacíos por ahora o básicos
  findAll() {
    return this.prisma.user.findMany();
  }

  findOne(id: number) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async update(id: number, updateUserDto: UpdateUserDto) {
    return this.prisma.user.update({
      where: { id },
      data: updateUserDto,
    });
  }

  async remove(id: number) {
    return this.prisma.user.delete({
      where: { id },
    });
  }
}