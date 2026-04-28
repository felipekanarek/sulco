import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const VERSION = 'v1';
const IV_LEN = 12; // GCM recommended

function getKey(): Buffer {
  const raw = process.env.MASTER_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'MASTER_ENCRYPTION_KEY não definida. Gere com `openssl rand -base64 32` e coloque em .env.local',
    );
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(
      `MASTER_ENCRYPTION_KEY deve ter 32 bytes decodificados (tem ${key.length}).`,
    );
  }
  return key;
}

/**
 * Cifra um Personal Access Token do Discogs para armazenamento at-rest.
 * Envelope: `v1:<iv-base64>:<tag-base64>:<ct-base64>`
 */
export function encryptPAT(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':');
}

/**
 * Alias semanticamente neutro de `encryptPAT`. Usar em código novo
 * (ex: chave de IA do Inc 014/BYOK) onde "PAT" é nome confuso. Mesmo
 * mecanismo AES-256-GCM via `MASTER_ENCRYPTION_KEY`.
 */
export const encryptSecret = encryptPAT;

/**
 * Decifra um PAT previamente cifrado. Lança erro se a chave mudou ou o envelope
 * está corrompido (MAC inválido).
 */
export function decryptPAT(stored: string): string {
  const parts = stored.split(':');
  if (parts.length !== 4) {
    throw new Error('Formato de token cifrado inválido');
  }
  const [version, ivB64, tagB64, ctB64] = parts;
  if (version !== VERSION) {
    throw new Error(`Versão de envelope não suportada: ${version}`);
  }
  const key = getKey();
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ct = Buffer.from(ctB64, 'base64');
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}

/**
 * Alias semanticamente neutro de `decryptPAT`. Mesmo mecanismo, nome
 * que deixa claro que serve pra qualquer segredo (chave de IA, etc).
 */
export const decryptSecret = decryptPAT;
