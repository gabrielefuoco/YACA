const fs = require('fs');
const path = require('path');
const readline = require('readline');

/**
 * Storage locale per il TMDB Dump.
 * Usa il formato NDJSON (.jsonl) per robustezza e semplicità di I/O (append in streaming).
 * Il formato NDJSON è nativamente supportato da DuckDB per letture ultra-veloci (JSON_READ_AUTO).
 */
class TmdbDumpStore {
    constructor(basePath = null) {
        if (basePath) {
            this.basePath = basePath;
        } else if (process.env.TMDB_DUMP_DIR) {
            this.basePath = path.resolve(process.env.TMDB_DUMP_DIR);
        } else {
            this.basePath = fs.existsSync('/data') 
                ? '/data/tmdb' 
                : path.resolve(__dirname, '../../.cache/tmdb');
        }
        
        if (!fs.existsSync(this.basePath)) {
            try {
                fs.mkdirSync(this.basePath, { recursive: true });
            } catch (_) {}
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

    async _processFileSafely(filePath, lineProcessorFn, onEndFn) {
        const tempPath = filePath + '.tmp';
        const fileStream = fs.createReadStream(filePath);
        const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
        
        const writeStream = fs.createWriteStream(tempPath);
        
        for await (const line of rl) {
            if (!line.trim()) continue;
            try {
                const doc = JSON.parse(line);
                const resultLine = lineProcessorFn(doc, line);
                if (resultLine !== null) {
                    writeStream.write(resultLine + '\n');
                }
            } catch (e) {
                // Skip invalid lines
            }
        }
        
        if (onEndFn) {
            onEndFn(writeStream);
        }
        
        writeStream.end();
        await new Promise((resolve, reject) => {
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
        });
        
        // Swap atomico
        fs.renameSync(tempPath, filePath);
    }

    async upsert(rows, mediaType) {
        if (!rows || rows.length === 0) return;
        const filePath = this._getFilePath(mediaType);
        
        const newRowsMap = new Map();
        for (const r of rows) newRowsMap.set(r.id, r);

        if (fs.existsSync(filePath)) {
            await this._processFileSafely(
                filePath, 
                (doc, line) => {
                    if (newRowsMap.has(doc.id)) {
                        const updated = JSON.stringify(newRowsMap.get(doc.id));
                        newRowsMap.delete(doc.id);
                        return updated;
                    }
                    return line;
                },
                (writeStream) => {
                    for (const doc of newRowsMap.values()) {
                        writeStream.write(JSON.stringify(doc) + '\n');
                    }
                }
            );
        } else {
            this.appendBatch(rows, mediaType);
        }
    }

    async deleteIds(ids, mediaType) {
        if (!ids || ids.length === 0) return;
        const filePath = this._getFilePath(mediaType);
        if (!fs.existsSync(filePath)) return;

        const idsSet = new Set(ids);
        await this._processFileSafely(
            filePath,
            (doc, line) => {
                if (!idsSet.has(doc.id)) return line;
                return null;
            }
        );
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
        const tempPath = `${cursorPath}.tmp`;
        fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
        fs.renameSync(tempPath, cursorPath);
    }

    getStatusPath() {
        return path.join(this.basePath, 'dump_status.json');
    }

    saveStatus(status) {
        const statusPath = this.getStatusPath();
        const payload = {
            ...status,
            updatedAt: new Date().toISOString()
        };
        const tempPath = `${statusPath}.tmp`;
        fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2));
        fs.renameSync(tempPath, statusPath);
    }

    loadStatus() {
        const statusPath = this.getStatusPath();
        const cursor = this.loadCursor();

        const getFileStat = (filePath) => {
            try {
                if (fs.existsSync(filePath)) {
                    const s = fs.statSync(filePath);
                    return { exists: true, size: s.size, mtime: s.mtime.toISOString(), mtimeMs: s.mtimeMs };
                }
            } catch (_) {}
            return { exists: false, size: 0, mtime: null, mtimeMs: 0 };
        };

        const moviesParquetPath = path.join(this.basePath, 'movies.parquet');
        const tvParquetPath = path.join(this.basePath, 'tv.parquet');
        const duckdbPath = path.join(this.basePath, 'catalog.duckdb');
        const titlesFts5Path = path.join(this.basePath, 'titles_fts5.db');
        const cursorPath = path.join(this.basePath, 'cursor.json');

        const duckdbStat = getFileStat(duckdbPath);
        const moviesParquetStat = getFileStat(moviesParquetPath);
        const tvParquetStat = getFileStat(tvParquetPath);
        const moviesJsonlStat = getFileStat(this._getFilePath('movies'));
        const tvJsonlStat = getFileStat(this._getFilePath('tv'));
        const titlesFts5Stat = getFileStat(titlesFts5Path);
        const cursorStat = getFileStat(cursorPath);

        const hasAnyArtifact = duckdbStat.exists || moviesParquetStat.exists || tvParquetStat.exists || moviesJsonlStat.exists || tvJsonlStat.exists;

        // Determina lastSync deducibile dall'artefatto più recente su disco
        let newestArtifactMtime = null;
        let newestArtifactMtimeMs = 0;
        for (const st of [duckdbStat, moviesParquetStat, tvParquetStat, moviesJsonlStat, tvJsonlStat]) {
            if (st.exists && st.mtimeMs > newestArtifactMtimeMs) {
                newestArtifactMtimeMs = st.mtimeMs;
                newestArtifactMtime = st.mtime;
            }
        }

        let parsedStatus = null;
        if (fs.existsSync(statusPath)) {
            try {
                parsedStatus = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
            } catch (_) {
                parsedStatus = null;
            }
        }

        const now = Date.now();
        const HEARTBEAT_TIMEOUT_MS = 10 * 60 * 1000;       // 10 minuti
        const MAX_SYNC_STALENESS_MS = 36 * 60 * 60 * 1000; // 36 ore

        let isRunning = false;
        let phase = 'uninitialized';
        let isStale = true;
        let staleReason = null;
        let currentTask = '';
        let progress = 0;
        let total = 0;
        let lastSync = null;
        let stats = { movies: 0, tv: 0 };
        let error = null;
        let updatedAt = null;

        if (parsedStatus) {
            updatedAt = parsedStatus.updatedAt || null;
            lastSync = parsedStatus.lastSync || newestArtifactMtime;
            stats = parsedStatus.stats || { movies: 0, tv: 0 };
            currentTask = parsedStatus.currentTask || '';
            progress = parsedStatus.progress || 0;
            total = parsedStatus.total || 0;
            error = parsedStatus.error || null;
            phase = parsedStatus.phase || 'idle';

            const updatedMs = updatedAt ? new Date(updatedAt).getTime() : 0;
            const lastSyncMs = lastSync ? new Date(lastSync).getTime() : 0;

            if (parsedStatus.isRunning) {
                if (updatedMs && (now - updatedMs > HEARTBEAT_TIMEOUT_MS)) {
                    // Heartbeat scaduto: processo morto, interrotto o crashato
                    isRunning = false;
                    phase = 'stale';
                    isStale = true;
                    staleReason = `Heartbeat scaduto da oltre 10 minuti (ultimo aggiornamento: ${updatedAt})`;
                } else {
                    isRunning = true;
                    isStale = false;
                }
            } else {
                isRunning = false;
                if (phase === 'error') {
                    isStale = true;
                    staleReason = error ? `Errore nel daemon: ${error}` : 'Daemon terminato con errore';
                } else if (lastSyncMs && (now - lastSyncMs > MAX_SYNC_STALENESS_MS)) {
                    phase = 'stale';
                    isStale = true;
                    staleReason = `Ultimo sync completato più di 36 ore fa (${lastSync})`;
                } else if (phase === 'idle') {
                    isStale = false;
                } else {
                    phase = 'stale';
                    isStale = true;
                    staleReason = 'Daemon non in esecuzione';
                }
            }
        } else {
            // Nessun dump_status.json sul volume
            if (hasAnyArtifact) {
                phase = 'stale';
                isStale = true;
                staleReason = 'File dump_status.json assente sul volume; rilevati artefatti pregressi';
                lastSync = newestArtifactMtime;
                currentTask = 'Nessun daemon attivo';
            } else {
                phase = 'uninitialized';
                isStale = true;
                staleReason = 'Nessun artefatto presente sul volume';
                currentTask = '';
            }
        }

        return {
            isRunning,
            phase,
            currentTask,
            progress,
            total,
            lastSync,
            stats,
            error,
            isStale,
            staleReason,
            updatedAt,
            artifacts: {
                duckdb: { exists: duckdbStat.exists, size: duckdbStat.size, mtime: duckdbStat.mtime },
                moviesParquet: { exists: moviesParquetStat.exists, size: moviesParquetStat.size, mtime: moviesParquetStat.mtime },
                tvParquet: { exists: tvParquetStat.exists, size: tvParquetStat.size, mtime: tvParquetStat.mtime },
                moviesJsonl: { exists: moviesJsonlStat.exists, size: moviesJsonlStat.size, mtime: moviesJsonlStat.mtime },
                tvJsonl: { exists: tvJsonlStat.exists, size: tvJsonlStat.size, mtime: tvJsonlStat.mtime },
                cursor: { exists: cursorStat.exists, mtime: cursorStat.mtime, completed: cursor?.completed || null },
                titlesFts5: { exists: titlesFts5Stat.exists, size: titlesFts5Stat.size, mtime: titlesFts5Stat.mtime }
            }
        };
    }
}

module.exports = TmdbDumpStore;
