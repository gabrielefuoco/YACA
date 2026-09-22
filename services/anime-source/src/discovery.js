/**
 * discovery.js
 * Gestione della discovery delle serie in corso da AnimeUnity:
 * - Paginazione e rispetto del budget
 * - Persistenza dell'elenco su disco (.cache/airing-series.json)
 * - Frequenza di aggiornamento giornaliera (~24h)
 * - Fallback resiliente su cache in caso di errore di rete / portale giù
 * - Battito di salute e verifica stato (.cache/last-run.json)
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_CACHE_DIR = path.join(__dirname, '../.cache');
const AIRING_SERIES_FILE = 'airing-series.json';
const LAST_RUN_FILE = 'last-run.json';
const MAX_HEALTH_AGE_MS = 12 * 60 * 60 * 1000; // 12 ore (ticket 18)
const MAX_LIST_AGE_MS = 24 * 60 * 60 * 1000;   // 24 ore (ticket 20)

class SeriesDiscoveryManager {
    constructor(options = {}) {
        this.cacheDir = options.cacheDir || DEFAULT_CACHE_DIR;
        this.listFile = path.join(this.cacheDir, AIRING_SERIES_FILE);
        this.heartbeatFile = path.join(this.cacheDir, LAST_RUN_FILE);
        this.maxHealthAgeMs = options.maxHealthAgeMs || MAX_HEALTH_AGE_MS;
        this.maxListAgeMs = options.maxListAgeMs || MAX_LIST_AGE_MS;
    }

    _ensureCacheDir() {
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
    }

    /**
     * Carica l'elenco memorizzato su disco
     * @returns {{ timestamp: string, count: number, records: Array<Object> }|null}
     */
    loadCachedList() {
        if (!fs.existsSync(this.listFile)) return null;
        try {
            const raw = fs.readFileSync(this.listFile, 'utf8');
            const data = JSON.parse(raw);
            if (data && Array.isArray(data.records)) {
                return data;
            }
            return null;
        } catch (err) {
            console.warn(`[Discovery] Impossibile leggere ${this.listFile}: ${err.message}`);
            return null;
        }
    }

    /**
     * Salva l'elenco su disco
     * @param {Array<Object>} records 
     * @returns {Object}
     */
    saveCachedList(records) {
        this._ensureCacheDir();
        const data = {
            timestamp: new Date().toISOString(),
            count: records.length,
            records
        };
        fs.writeFileSync(this.listFile, JSON.stringify(data, null, 2), 'utf8');
        return data;
    }

    /**
     * Recupera le serie in corso da tracciare:
     * - Se in cache e più recente di 24h, riusa la cache (a meno di forceRefresh)
     * - Altrimenti interroga AnimeUnity
     * - Se AnimeUnity fallisce, ricade sulla cache esistente senza azzerarla
     * @param {Object} params
     * @param {Object} params.client Istanza di AnimeUnityClient
     * @param {number} [params.limit=300] Budget massimo per giro
     * @param {boolean} [params.forceRefresh=false]
     * @returns {Promise<{ records: Array<Object>, fromCache: boolean, timestamp: string, ageHours?: string, fallback?: boolean }>}
     */
    async getTrackedSeries({ client, limit = 300, forceRefresh = false } = {}) {
        const cached = this.loadCachedList();
        const now = Date.now();

        const isFresh = Boolean(
            cached &&
            cached.timestamp &&
            (now - new Date(cached.timestamp).getTime() < this.maxListAgeMs) &&
            Array.isArray(cached.records) &&
            cached.records.length > 0
        );

        if (!forceRefresh && isFresh) {
            const ageHours = ((now - new Date(cached.timestamp).getTime()) / (1000 * 60 * 60)).toFixed(1);
            return {
                records: cached.records,
                fromCache: true,
                timestamp: cached.timestamp,
                ageHours
            };
        }

        // Discovery dal portale AnimeUnity
        let fetchedRecords = null;
        try {
            fetchedRecords = await client.getOngoingSeries({ limit });
        } catch (err) {
            console.error(`[Discovery] Errore durante il fetch da AnimeUnity: ${err.message}`);
        }

        if (Array.isArray(fetchedRecords) && fetchedRecords.length > 0) {
            this.saveCachedList(fetchedRecords);
            return {
                records: fetchedRecords,
                fromCache: false,
                timestamp: new Date().toISOString()
            };
        }

        // Fallback: errore o elenco vuoto dal portale -> NON azzerare l'elenco corrente
        if (cached && Array.isArray(cached.records) && cached.records.length > 0) {
            console.warn(`[Discovery] Lettura elenco portale fallita o vuota. Mantengo valida l'ultima lista nota in cache (${cached.records.length} serie).`);
            return {
                records: cached.records,
                fromCache: true,
                timestamp: cached.timestamp,
                fallback: true
            };
        }

        return {
            records: [],
            fromCache: false,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Scrive il battito di salute (timestamp dell'ultimo giro riuscito)
     * @param {Date} [timestamp]
     * @returns {Object}
     */
    writeHeartbeat(timestamp = new Date()) {
        this._ensureCacheDir();
        const iso = timestamp instanceof Date ? timestamp.toISOString() : new Date(timestamp).toISOString();
        const data = {
            timestamp: iso
        };
        fs.writeFileSync(this.heartbeatFile, JSON.stringify(data, null, 2), 'utf8');
        return data;
    }

    /**
     * Verifica la salute del modulo:
     * - Esce 0 (ok: true) se l'ultimo giro riuscito è più recente di 12 ore
     * - Esce 1 (ok: false) altrimenti o se il file non esiste
     * @returns {{ ok: boolean, ageHours: string|null, timestamp: string|null, message: string }}
     */
    checkHealth() {
        if (!fs.existsSync(this.heartbeatFile)) {
            return {
                ok: false,
                ageHours: null,
                timestamp: null,
                message: `Nessun battito registrato (${this.heartbeatFile} non esiste).`
            };
        }

        try {
            const raw = fs.readFileSync(this.heartbeatFile, 'utf8');
            const data = JSON.parse(raw);
            if (!data || !data.timestamp) {
                return {
                    ok: false,
                    ageHours: null,
                    timestamp: null,
                    message: `File di battito corrotto (${this.heartbeatFile}): timestamp mancante.`
                };
            }

            const ts = new Date(data.timestamp).getTime();
            if (isNaN(ts)) {
                return {
                    ok: false,
                    ageHours: null,
                    timestamp: data.timestamp,
                    message: `Timestamp di battito non valido: "${data.timestamp}".`
                };
            }

            const ageMs = Date.now() - ts;
            const ageHours = (ageMs / (1000 * 60 * 60)).toFixed(1);

            if (ageMs < 0) {
                return {
                    ok: false,
                    ageHours,
                    timestamp: data.timestamp,
                    message: `Timestamp nel futuro rilevato: ${data.timestamp}.`
                };
            }

            if (ageMs <= this.maxHealthAgeMs) {
                return {
                    ok: true,
                    ageHours,
                    timestamp: data.timestamp,
                    message: `OK: Ultimo giro riuscito ${ageHours} ore fa (${data.timestamp}).`
                };
            } else {
                return {
                    ok: false,
                    ageHours,
                    timestamp: data.timestamp,
                    message: `FAIL: Ultimo giro troppo vecchio (${ageHours} ore fa > soglia di 12 ore, timestamp: ${data.timestamp}).`
                };
            }
        } catch (err) {
            return {
                ok: false,
                ageHours: null,
                timestamp: null,
                message: `Errore nella lettura del file di battito: ${err.message}`
            };
        }
    }
}

module.exports = {
    SeriesDiscoveryManager,
    MAX_HEALTH_AGE_MS,
    MAX_LIST_AGE_MS,
    AIRING_SERIES_FILE,
    LAST_RUN_FILE
};
