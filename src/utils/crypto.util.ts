import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-ctr';
// Lee la clave del .env o usa una por defecto (solo para dev)
const SECRET_KEY = process.env.ENCRYPTION_KEY || 'ClaveSuperSecretaDe32Caracteres!!';
const IV_LENGTH = 16;

export function encrypt(text: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(SECRET_KEY), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    // Guardamos IV + TextoEncriptado separados por ':'
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decrypt(text: string): string {
    const textParts = text.split(':');
    if (textParts.length < 2) return text; // Si no tiene ':', asumimos que no está encriptado (retrocompatibilidad)

    const iv = Buffer.from(textParts.shift()!, 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(SECRET_KEY), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}