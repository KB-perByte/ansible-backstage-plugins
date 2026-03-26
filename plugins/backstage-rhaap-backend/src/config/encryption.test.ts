import { encrypt, decrypt, isEncrypted } from './encryption';

const TEST_SECRET = 'test-backend-secret-for-encryption-tests';

describe('encryption', () => {
  describe('encrypt', () => {
    it('produces a string with the enc:v1: prefix', () => {
      const result = encrypt('hello world', TEST_SECRET);
      expect(result).toMatch(/^enc:v1:/);
    });

    it('produces different ciphertexts for the same plaintext (random IV)', () => {
      const a = encrypt('same-value', TEST_SECRET);
      const b = encrypt('same-value', TEST_SECRET);
      expect(a).not.toBe(b);
    });

    it('handles empty string', () => {
      const result = encrypt('', TEST_SECRET);
      expect(result).toMatch(/^enc:v1:/);
    });

    it('handles unicode characters', () => {
      const result = encrypt('日本語テスト 🔐', TEST_SECRET);
      expect(result).toMatch(/^enc:v1:/);
    });

    it('handles long values', () => {
      const longValue = 'x'.repeat(10000);
      const result = encrypt(longValue, TEST_SECRET);
      expect(result).toMatch(/^enc:v1:/);
    });
  });

  describe('decrypt', () => {
    it('round-trips correctly', () => {
      const original = 'my-secret-token-12345';
      const encrypted = encrypt(original, TEST_SECRET);
      const decrypted = decrypt(encrypted, TEST_SECRET);
      expect(decrypted).toBe(original);
    });

    it('round-trips empty string', () => {
      const encrypted = encrypt('', TEST_SECRET);
      expect(decrypt(encrypted, TEST_SECRET)).toBe('');
    });

    it('round-trips unicode', () => {
      const original = '日本語テスト 🔐';
      const encrypted = encrypt(original, TEST_SECRET);
      expect(decrypt(encrypted, TEST_SECRET)).toBe(original);
    });

    it('round-trips long values', () => {
      const original = 'x'.repeat(10000);
      const encrypted = encrypt(original, TEST_SECRET);
      expect(decrypt(encrypted, TEST_SECRET)).toBe(original);
    });

    it('throws on non-encrypted value', () => {
      expect(() => decrypt('plain-text', TEST_SECRET)).toThrow(
        'Value is not encrypted',
      );
    });

    it('throws on wrong key', () => {
      const encrypted = encrypt('secret', TEST_SECRET);
      expect(() => decrypt(encrypted, 'wrong-key')).toThrow();
    });

    it('throws on corrupted ciphertext', () => {
      const encrypted = encrypt('secret', TEST_SECRET);
      const corrupted = `${encrypted.slice(0, -5)}AAAAA`;
      expect(() => decrypt(corrupted, TEST_SECRET)).toThrow();
    });

    it('throws on truncated ciphertext', () => {
      expect(() => decrypt('enc:v1:dG9vc2hvcnQ=', TEST_SECRET)).toThrow(
        'too short',
      );
    });
  });

  describe('isEncrypted', () => {
    it('returns true for encrypted values', () => {
      const encrypted = encrypt('test', TEST_SECRET);
      expect(isEncrypted(encrypted)).toBe(true);
    });

    it('returns false for plain text', () => {
      expect(isEncrypted('plain-text')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isEncrypted('')).toBe(false);
    });

    it('returns false for partial prefix', () => {
      expect(isEncrypted('enc:v')).toBe(false);
    });

    it('returns true for prefix-only (edge case)', () => {
      expect(isEncrypted('enc:v1:')).toBe(true);
    });
  });
});
