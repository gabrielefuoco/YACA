const fs = require('fs');
const path = require('path');
const readline = require('readline');

/**
 * Storage locale per il TMDB Dump.
 * Usa il formato NDJSON (.jsonl) per robustezza e semplicità di I/O (append in streaming).
 * Il formato NDJSON è nativamente supportato da DuckDB per letture ultra-veloci (JSON_READ_AUTO).
 */
class TmdbDumpStore {
    constructor() {
        // Usa il volume persistente /data di HF Spaces, oppure la cartella .cache locale per dev
        this.basePath = fs.existsSync('/data') 
            ? '/data/tmdb' 
            : path.resolve(__dirname, '../../.cache/tmdb');
        
        if (!fs.existsSync(this.basePath)) {
            fs.mkdirSync(this.basePath, { recursive: true });
        }
    }

    _getFilePath(mediaType) {
        // mediaType = 'movies' o 'tv'
        return path.join(this.basePath, `master_${mediaType}.jsonl`);
    }

    storeExists(mediaType) {
        return fs.existsSync(this._getFilePath(mediaType));
    }

    async loadIds(mediaType) {
        const filePath = this._getFilePath(mediaType);
        const ids = new Set();
        if (!fs.existsSync(filePath)) return ids;

        const fileStream = fs.createReadStream(filePath);
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        // Ottimizzazione: cerchiamo l'ID usando una Regex invece di fare JSON.parse di 87.000 JSON giganti
        // Siccome l'ID è il primo campo: {"id":123,...
        const idRegex = /"id":\s*(\d+)/;

        for await (const line of rl) {
            if (!line.trim()) continue;
            const match = line.match(idRegex);
            if (match && match[1]) {
                ids.add(parseInt(match[1], 10));
            }
        }
        return ids;
    }

    async countLines(mediaType) {
        const filePath = this._getFilePath(mediaType);
        if (!fs.existsSync(filePath)) return 0;
        
        let count = 0;
        const fileStream = fs.createReadStream(filePath);
        const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
        for await (const line of rl) {
            if (line.trim()) count++;
        }
        return count;
    }

    appendBatch(rows, mediaType) {
        if (!rows || rows.length === 0) return;
        const filePath = this._getFilePath(mediaType);
        const data = rows.map(r => JSON.stringify(r)).join('\n') + '\n';
        fs.appendFileSync(filePath, data);
    }

    async upsert(rows, mediaType) {
        if (!rows || rows.length === 0) return;
        const filePath = this._getFilePath(mediaType);
        
        const newRowsMap = new Map();
        for (const r of rows) newRowsMap.set(r.id, r);

        const tempPath = filePath + '.tmp';
        
        if (fs.existsSync(filePath)) {
            const fileStream = fs.createReadStream(filePath);
            const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
            
            const writeStream = fs.createWriteStream(tempPath);
            
            for await (const line of rl) {
                if (!line.trim()) continue;
                try {
                    const doc = JSON.parse(line);
                    if (newRowsMap.has(doc.id)) {
                        // Scrivi la versione aggiornata e rimuovi dalla mappa
                        writeStream.write(JSON.stringify(newRowsMap.get(doc.id)) + '\n');
                        newRowsMap.delete(doc.id);
                    } else {
                        // Mantieni la riga originale
                        writeStream.write(line + '\n');
                    }
                } catch (e) {
                    // Skip invalid lines
                }
            }
            
            // Aggiungi in coda eventuali nuovi inserimenti rimasti nella mappa
            for (const doc of newRowsMap.values()) {
                writeStream.write(JSON.stringify(doc) + '\n');
            }
            
            writeStream.end();
            await new Promise((resolve, reject) => {
                writeStream.on('finish', resolve);
                writeStream.on('error', reject);
            });
            
            // Swap atomico
            fs.renameSync(tempPath, filePath);
        } else {
            this.appendBatch(rows, mediaType);
        }
    }

    async deleteIds(ids, mediaType) {
        if (!ids || ids.length === 0) return;
        const filePath = this._getFilePath(mediaType);
        if (!fs.existsSync(filePath)) return;

        const idsSet = new Set(ids);
        const tempPath = filePath + '.tmp';
        
        const fileStream = fs.createReadStream(filePath);
        const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
        
        const writeStream = fs.createWriteStream(tempPath);
        
        for await (const line of rl) {
            if (!line.trim()) continue;
            try {
                const doc = JSON.parse(line);
                if (!idsSet.has(doc.id)) {
                    writeStream.write(line + '\n');
                }
            } catch (e) { }
        }
        
        writeStream.end();
        await new Promise((resolve, reject) => {
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
        });
        
        fs.renameSync(tempPath, filePath);
    }

    loadCursor() {
        const cursorPath = path.join(this.basePath, 'cursor.json');
        if (fs.existsSync(cursorPath)) {
            try {
                return JSON.parse(fs.readFileSync(cursorPath, 'utf8'));
            } catch (e) {
                return null;
            }
        }
        return null;
    }

    saveCursor(data) {
        const cursorPath = path.join(this.basePath, 'cursor.json');
        fs.writeFileSync(cursorPath, JSON.stringify(data, null, 2));
    }
}

module.exports = TmdbDumpStore;
