/**
 * AES-256-GCM encryption/decryption utility for sensitive data.
 * Uses Node.js native crypto module.
 * 
 * Encrypted values are stored as: YACA_ENC:v1:IV:AuthTag:CipherText (all base64-encoded).
 * The MASTER_ENCRYPTION_KEY env var must be a 32-byte base64-encoded string.
 */
const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM standard
const AUTH_TAG_LENGTH = 16;
const ENCRYPTION_PREFIX = 'YACA_ENC:v1';
const ENCRYPTED_FORMAT = /^YACA_ENC:v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/;

/**
 * Returns the master encryption key from the environment.
 * @returns {Buffer} 32-byte key buffer.
 */
function getMasterKey() {
    const keyStr = process.env.MASTER_ENCRYPTION_KEY;
    if (!keyStr) {
        throw new Error('MASTER_ENCRYPTION_KEY non configurata.');
    }
    const buf = Buffer.from(keyStr, 'base64');
    if (buf.length !== 32) {
        throw new Error('MASTER_ENCRYPTION_KEY deve essere una chiave base64 valida da 32 byte.');
    }
    return buf;
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * @param {string} plaintext - The value to encrypt.
 * @returns {string} Encrypted string in format YACA_ENC:v1:IV:AuthTag:CipherText
 */
function encrypt(plaintext) {
    const key = getMasterKey();
    if (typeof plaintext !== 'string' || plaintext.length === 0) return plaintext;

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const authTag = cipher.getAuthTag();

    return `${ENCRYPTION_PREFIX}:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM encrypted string.
 * @param {string} encryptedValue - Encrypted value in format YACA_ENC:v1:IV:AuthTag:CipherText
 * @returns {string} Decrypted plaintext
 */
function decrypt(encryptedValue) {
    const key = getMasterKey();
    if (typeof encryptedValue !== 'string' || encryptedValue.length === 0) return encryptedValue;

    const parts = encryptedValue.split(':');
    if (parts.length !== 5 || parts[0] !== 'YACA_ENC' || parts[1] !== 'v1') {
        // Not in encrypted format — return as-is (migration compatibility)
        return encryptedValue;
    }

    const iv = Buffer.from(parts[2], 'base64');
    const authTag = Buffer.from(parts[3], 'base64');
    const ciphertext = parts[4];

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
}

/**
 * Checks if a value is already in the encrypted format (YACA_ENC:v1:IV:AuthTag:CipherText).
 * @param {string} value
 * @returns {boolean}
 */
function isEncrypted(value) {
    if (typeof value !== 'string') return false;
    return value.startsWith(`${ENCRYPTION_PREFIX}:`) && ENCRYPTED_FORMAT.test(value);
}

/**
 * Encrypts a value only if it's not already encrypted.
 * @param {string} value
 * @returns {string}
 */
function encryptIfNeeded(value) {
    if (!value || typeof value !== 'string' || value.length === 0) return value;
    if (isEncrypted(value)) return value; // Already encrypted
    return encrypt(value);
}

/**
 * Decrypts a value safely — if decryption fails (e.g. not encrypted), returns the original.
 * @param {string} value
 * @returns {string}
 */
function decryptSafe(value) {
    if (!value || typeof value !== 'string' || value.length === 0) return value;
    if (!isEncrypted(value)) return value; // Not encrypted, return as-is
    return decrypt(value);
}

module.exports = {
    encryptIfNeeded,
    decryptSafe
};
