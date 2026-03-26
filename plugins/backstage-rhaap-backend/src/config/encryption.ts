import { createCipheriv, createDecipheriv, randomBytes, createHmac } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const CIPHERTEXT_PREFIX = 'enc:v1:';
const HKDF_SALT = 'portal-admin-config-encryption';
const HKDF_INFO = 'v1';

/**
 * Derives a 256-bit encryption key from the backend secret using HKDF-like
 * derivation (HMAC-SHA256 with fixed salt and info).
 */
function deriveKey(backendSecret: string): Buffer {
  // Use HMAC-SHA256 as a simple KDF (extract step)
  const prk = createHmac('sha256', HKDF_SALT)
    .update(backendSecret)
    .digest();

  // Expand step — produce exactly 32 bytes
  const okm = createHmac('sha256', prk)
    .update(HKDF_INFO)
    .update(Buffer.from([1]))
    .digest();

  return okm.subarray(0, KEY_LENGTH);
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 *
 * @param plaintext - The value to encrypt
 * @param backendSecret - The BACKEND_SECRET used for key derivation
 * @returns Ciphertext in format: `enc:v1:<base64(iv ∥ ciphertext ∥ authTag)>`
 */
export function encrypt(plaintext: string, backendSecret: string): string {
  const key = deriveKey(backendSecret);
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  // Concatenate: iv (12) + ciphertext (variable) + authTag (16)
  const combined = Buffer.concat([iv, encrypted, authTag]);

  return `${CIPHERTEXT_PREFIX}${combined.toString('base64')}`;
}

/**
 * Decrypts a ciphertext string that was encrypted with {@link encrypt}.
 *
 * @param ciphertext - The encrypted value (must start with `enc:v1:`)
 * @param backendSecret - The BACKEND_SECRET used for key derivation
 * @returns The original plaintext
 * @throws Error if the ciphertext is malformed or the key is wrong
 */
export function decrypt(ciphertext: string, backendSecret: string): string {
  if (!isEncrypted(ciphertext)) {
    throw new Error(
      'Value is not encrypted — expected prefix "enc:v1:". Was it stored without encryption?',
    );
  }

  const key = deriveKey(backendSecret);
  const combined = Buffer.from(
    ciphertext.slice(CIPHERTEXT_PREFIX.length),
    'base64',
  );

  if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Encrypted value is too short — data may be corrupted');
  }

  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH);
  const encryptedData = combined.subarray(
    IV_LENGTH,
    combined.length - AUTH_TAG_LENGTH,
  );

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encryptedData),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

/**
 * Checks whether a value is encrypted (has the `enc:v1:` prefix).
 */
export function isEncrypted(value: string): boolean {
  return value.startsWith(CIPHERTEXT_PREFIX);
}
