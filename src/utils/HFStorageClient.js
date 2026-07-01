const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');

/**
 * Client proxy for Local/Mounted Storage (e.g. Hugging Face Space /data volume)
 */
class LocalStorageClient {
    constructor() {
        // Controllo robusto: se esiste la cartella /data (mounted in HF Spaces), la usiamo.
        // Altrimenti (es. dev locale) usiamo .cache locale
        this.basePath = fs.existsSync('/data') ? '/data/badges' : path.resolve(__dirname, '../../.cache/badges');
        
        this._ensureDirectory();

        // Avvia il Garbage Collector in background (ritardato di 5 minuti per non pesare sul bootup)
        setTimeout(() => this._startGarbageCollector(), 5 * 60 * 1000);
        // Eseguilo periodicamente ogni 24 ore
        setInterval(() => this._startGarbageCollector(), 24 * 60 * 60 * 1000);
    }

    async _startGarbageCollector() {
        try {
            console.log(`[LocalStorageClient] Starting Garbage Collection in ${this.basePath}...`);
            const files = await fsPromises.readdir(this.basePath);
            const now = Date.now();
            const maxAgeMs = 7 * 24 * 60 * 60 * 1000; // 7 giorni in ms
            let deletedCount = 0;

            for (const file of files) {
                if (!file.endsWith('.jpg')) continue;

                const filePath = path.join(this.basePath, file);
                try {
                    const stats = await fsPromises.stat(filePath);
                    if (now - stats.mtimeMs > maxAgeMs) {
                        await fsPromises.unlink(filePath);
                        deletedCount++;
                    }
                } catch (err) {
                    console.error(`[LocalStorageClient] Failed to check/delete file ${file}:`, err.message);
                }
            }

            if (deletedCount > 0) {
                console.log(`[LocalStorageClient] GC completed. Deleted ${deletedCount} old badges.`);
            }
        } catch (error) {
            console.error(`[LocalStorageClient] Garbage Collection error:`, error.message);
        }
    }

    _ensureDirectory() {
        try {
            if (!fs.existsSync(this.basePath)) {
                fs.mkdirSync(this.basePath, { recursive: true });
                console.log(`[LocalStorageClient] Created cache directory at ${this.basePath}`);
            }
        } catch (err) {
            console.error(`[LocalStorageClient] Error creating directory ${this.basePath}:`, err.message);
        }
    }

    /**
     * Helper to get the absolute path of a cached badge, sanificando caratteri non validi
     */
    _getFilePath(cacheKey) {
        // Rimuove i due punti ":" per evitare corruzioni FS su Windows/Express e usa un underscore
        const safeKey = cacheKey.replace(/:/g, '_');
        return path.join(this.basePath, `${safeKey}.jpg`);
    }

    /**
     * Check if an object exists in the local mount
     * @param {string} cacheKey 
     * @returns {string|null} The absolute file path if exists, null otherwise
     */
    async exists(cacheKey) {
        const filePath = this._getFilePath(cacheKey);
        try {
            await fsPromises.stat(filePath);
            return filePath;
        } catch (error) {
            if (error.code === 'ENOENT') {
                return null; // non esiste
            }
            console.error(`[LocalStorageClient] Check exists error for ${filePath}:`, error.message);
            return null;
        }
    }

    /**
     * Save an image buffer to the local mount
     * @param {string} cacheKey 
     * @param {Buffer} buffer 
     * @returns {string|null} The absolute file path of the uploaded image
     */
    async upload(cacheKey, buffer) {
        const filePath = this._getFilePath(cacheKey);
        try {
            await fsPromises.writeFile(filePath, buffer);
            return filePath;
        } catch (error) {
            // Se la directory non esisteva (es. cancellata in runtime), ricreiamola e riproviamo
            if (error.code === 'ENOENT') {
                try {
                    this._ensureDirectory();
                    await fsPromises.writeFile(filePath, buffer);
                    return filePath;
                } catch (retryErr) {
                    console.error(`[LocalStorageClient] Retry upload failed for ${filePath}:`, retryErr.message);
                    return null;
                }
            }
            console.error(`[LocalStorageClient] Upload error for ${filePath}:`, error.message);
            return null;
        }
    }
}

module.exports = new LocalStorageClient();
