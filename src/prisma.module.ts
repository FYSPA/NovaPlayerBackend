import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global() // <--- ¡Esto es la magia! Hace que el servicio sea visible en toda la app
@Module({
    providers: [PrismaService],
    exports: [PrismaService], // Exportamos el servicio para que otros lo usen
})
export class PrismaModule { }