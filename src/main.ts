import * as dotenv from 'dotenv';
dotenv.config(); 

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());

  // 1. SEGURIDAD CORS: Solo permitimos a nuestro Frontend (localhost:3000)
  app.enableCors({
    origin: ['http://localhost:3000', 'http://localhost:3001'], 
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  // 2. VALIDACIÓN DE DATOS (DTOs)
  // Esto rechaza cualquier dato extra o basura que envíen a tu API
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,            
    forbidNonWhitelisted: true, 
    transform: true,            
  }));

  //const port = process.env.PORT || 9000;
  await app.listen(process.env.PORT || 9000, '0.0.0.0');
  //console.log(`🚀 NovaPlayer Backend Server on http://localhost:${port}`);
}
bootstrap();