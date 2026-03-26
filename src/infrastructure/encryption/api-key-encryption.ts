/**
 * API Key Encryption Service
 * Provides AES-256-GCM encryption/decryption for sensitive API credentials
 *
 * Security Features:
 * - AES-256-GCM authenticated encryption
 * - Random IV (Initialization Vector) per encryption
 * - Authentication tag for integrity verification
 * - Base64 encoding for storage
 *
 * Storage Format: {iv}:{authTag}:{encryptedData} (all base64 encoded)
 */

import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { getConfig } from '../../config/index.js';
import { getLogger } from '../logging/index.js';

const logger = getLogger();

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits
const KEY_LENGTH = 32; // 256 bits

/**
 * Get encryption key from environment or generate warning
 */
function getEncryptionKey(): Buffer {
  const config = getConfig();

  // Use JWT_SECRET as encryption key base (it should be 32+ chars)
  // In production, use a dedicated ENCRYPTION_KEY environment variable
  const keySource = process.env['ENCRYPTION_KEY'] || config.auth.jwtSecret;

  if (!keySource || keySource.length < 32) {
    logger.warn({
      msg: 'Encryption key too short or missing. Using default (INSECURE for production)',
      keyLength: keySource?.length || 0,
    });

    // Fallback for development only (NEVER use in production)
    return Buffer.from('phishlogic-dev-encryption-key-32chars'.padEnd(KEY_LENGTH, '0'));
  }

  // Derive a 32-byte key from the source
  return Buffer.from(keySource.slice(0, KEY_LENGTH).padEnd(KEY_LENGTH, '0'));
}

/**
 * Encrypt sensitive data (API keys, secrets)
 *
 * @param plaintext - Data to encrypt
 * @returns Encrypted string in format: {iv}:{authTag}:{encryptedData}
 */
export function encrypt(plaintext: string): string {
  try {
    const key = getEncryptionKey();
    const iv = randomBytes(IV_LENGTH);

    const cipher = createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    // Format: {iv}:{authTag}:{encryptedData}
    const result = `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;

    logger.debug({
      msg: 'Data encrypted successfully',
      dataLength: plaintext.length,
      encryptedLength: result.length,
    });

    return result;
  } catch (error) {
    logger.error({
      msg: 'Encryption failed',
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypt encrypted data
 *
 * @param encryptedData - Encrypted string in format: {iv}:{authTag}:{encryptedData}
 * @returns Decrypted plaintext
 */
export function decrypt(encryptedData: string): string {
  try {
    // Parse encrypted format
    const parts = encryptedData.split(':');

    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }

    const [ivBase64, authTagBase64, encrypted] = parts as [string, string, string];

    const key = getEncryptionKey();
    const iv = Buffer.from(ivBase64, 'base64');
    const authTag = Buffer.from(authTagBase64, 'base64');

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted: string = decipher.update(encrypted, 'base64', 'utf8') as string;
    decrypted += decipher.final('utf8');

    logger.debug({
      msg: 'Data decrypted successfully',
      decryptedLength: decrypted.length,
    });

    return decrypted;
  } catch (error) {
    logger.error({
      msg: 'Decryption failed',
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error('Failed to decrypt data - data may be corrupted or key may have changed');
  }
}

/**
 * Check if encryption key is properly configured
 *
 * @returns true if encryption key is secure, false otherwise
 */
export function isEncryptionKeySecure(): boolean {
  const keySource = process.env['ENCRYPTION_KEY'] || process.env['JWT_SECRET'];
  return !!keySource && keySource.length >= 32 && keySource !== 'phishlogic-dev-jwt-secret-key-change-in-production-min-32-chars';
}

/**
 * Validate encrypted data format without decrypting
 *
 * @param encryptedData - Data to validate
 * @returns true if format is valid
 */
export function isValidEncryptedFormat(encryptedData: string): boolean {
  try {
    const parts = encryptedData.split(':');

    if (parts.length !== 3) {
      return false;
    }

    const [ivBase64, authTagBase64, encrypted] = parts as [string, string, string];

    // Validate base64 format
    const ivBuffer = Buffer.from(ivBase64, 'base64');
    const authTagBuffer = Buffer.from(authTagBase64, 'base64');

    // Check lengths
    if (ivBuffer.length !== IV_LENGTH || authTagBuffer.length !== AUTH_TAG_LENGTH) {
      return false;
    }

    // Validate encrypted data is base64
    if (!encrypted || Buffer.from(encrypted, 'base64').toString('base64') !== encrypted) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Rotate encryption key by re-encrypting data with new key
 *
 * @param encryptedData - Data encrypted with old key
 * @param oldKey - Old encryption key
 * @returns Data re-encrypted with current key
 */
export function rotateEncryption(_encryptedData: string, _oldKey: string): string {
  // This would be used during key rotation
  // For now, just throw an error as it's not implemented
  throw new Error('Key rotation not yet implemented');
}

/**
 * Sanitize API key for logging (show first/last 4 chars only)
 *
 * @param apiKey - API key to sanitize
 * @returns Sanitized key like "sk-1234...7890"
 */
export function sanitizeApiKey(apiKey: string): string {
  if (!apiKey || apiKey.length < 8) {
    return '***';
  }

  const first = apiKey.slice(0, 4);
  const last = apiKey.slice(-4);

  return `${first}...${last}`;
}
