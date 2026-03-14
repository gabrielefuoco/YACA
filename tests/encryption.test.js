const crypto = require('crypto');

describe('encryption module', () => {
    const TEST_KEY = crypto.randomBytes(32).toString('base64');
    let encrypt, decrypt, encryptIfNeeded, decryptSafe, getMasterKey, isEncrypted;

    beforeEach(() => {
        jest.resetModules();
        process.env.MASTER_ENCRYPTION_KEY = TEST_KEY;
        ({ encrypt, decrypt, encryptIfNeeded, decryptSafe, getMasterKey, isEncrypted } = require('../src/utils/encryption'));
    });

    afterEach(() => {
        delete process.env.MASTER_ENCRYPTION_KEY;
    });

    it('should encrypt and decrypt a string correctly', () => {
        const plaintext = 'my-secret-api-key-12345';
        const encrypted = encrypt(plaintext);
        expect(encrypted).not.toBe(plaintext);
        // Format: YACA_ENC:v1:iv:authTag:ciphertext
        const parts = encrypted.split(':');
        expect(parts.slice(0, 2).join(':')).toBe('YACA_ENC:v1');
        expect(parts).toHaveLength(5);
        const decrypted = decrypt(encrypted);
        expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertexts for the same plaintext (random IV)', () => {
        const plaintext = 'same-text-twice';
        const enc1 = encrypt(plaintext);
        const enc2 = encrypt(plaintext);
        expect(enc1).not.toBe(enc2);
        expect(decrypt(enc1)).toBe(plaintext);
        expect(decrypt(enc2)).toBe(plaintext);
    });

    it('encryptIfNeeded should not double-encrypt already encrypted values', () => {
        const plaintext = 'original-value';
        const encrypted = encryptIfNeeded(plaintext);
        expect(encrypted).not.toBe(plaintext);
        // Calling encryptIfNeeded again on encrypted value should return same value
        const doubleEncrypted = encryptIfNeeded(encrypted);
        expect(doubleEncrypted).toBe(encrypted);
    });

    it('decryptSafe should return plaintext for non-encrypted strings', () => {
        const plaintext = 'not-encrypted-just-plain';
        const result = decryptSafe(plaintext);
        expect(result).toBe(plaintext);
    });

    it('decryptSafe should decrypt properly encrypted strings', () => {
        const plaintext = 'my-api-key';
        const encrypted = encrypt(plaintext);
        const result = decryptSafe(encrypted);
        expect(result).toBe(plaintext);
    });

    it('should correctly identify colon-containing plaintext as unencrypted', () => {
        const plaintext = 'tmdb:key:with:colons';
        expect(isEncrypted(plaintext)).toBe(false);
        expect(encryptIfNeeded(plaintext)).not.toBe(plaintext);
    });

    it('getMasterKey should return the configured key', () => {
        const key = getMasterKey();
        expect(key).toBeTruthy();
    });

    it('getMasterKey should throw when MASTER_ENCRYPTION_KEY is not set', () => {
        delete process.env.MASTER_ENCRYPTION_KEY;
        jest.resetModules();
        const { getMasterKey: getKey } = require('../src/utils/encryption');
        expect(() => getKey()).toThrow('MASTER_ENCRYPTION_KEY');
    });

    it('decrypt should throw on tampered ciphertext', () => {
        const encrypted = encrypt('valid-data');
        const parts = encrypted.split(':');
        // Tamper with the ciphertext portion
        parts[4] = parts[4].split('').reverse().join('');
        const tampered = parts.join(':');
        expect(() => decrypt(tampered)).toThrow();
        expect(() => decryptSafe(tampered)).toThrow();
    });

    it('decrypt should throw when IV or auth tag is tampered', () => {
        const encrypted = encrypt('valid-data');

        const ivTamperedParts = encrypted.split(':');
        ivTamperedParts[2] = ivTamperedParts[2].split('').reverse().join('');
        expect(() => decrypt(ivTamperedParts.join(':'))).toThrow();

        const tagTamperedParts = encrypted.split(':');
        tagTamperedParts[3] = tagTamperedParts[3].split('').reverse().join('');
        expect(() => decrypt(tagTamperedParts.join(':'))).toThrow();
    });

    it('should handle empty strings gracefully in encryptIfNeeded', () => {
        expect(encryptIfNeeded('')).toBe('');
    });

    it('should handle empty strings gracefully in decryptSafe', () => {
        expect(decryptSafe('')).toBe('');
    });

    it('should handle unicode characters', () => {
        const unicode = '🔑 Chiave Segreta ñ äöü';
        const encrypted = encrypt(unicode);
        expect(decrypt(encrypted)).toBe(unicode);
    });
});
