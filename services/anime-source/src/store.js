/**
 * store.js
 * Gestione della persistenza su MongoDB per anime_airing_state.
 * Supporta dependency injection per testare senza database.
 * Effettua un merge intelligente tra stato esistente e nuovo (chiave season:episode)
 * per evitare la perdita di stagioni precedenti.
 */

const { mergeAiringDocuments } = require('./aggregate');

let MongoClient = null;
try {
    MongoClient = require('mongodb').MongoClient;
} catch {
    // Gestito a runtime se mongodb non è installato
}

const DEFAULT_COLLECTION_NAME = 'anime_airing_state';

class AiringStateStore {
    /**
     * @param {Object} [collectionOrDb] Istanza di Db o Collection di MongoDB, oppure mock per i test
     */
    constructor(collectionOrDb = null) {
        if (collectionOrDb) {
            this.collection = typeof collectionOrDb.collection === 'function'
                ? collectionOrDb.collection(DEFAULT_COLLECTION_NAME)
                : collectionOrDb;
        } else {
            this.collection = null;
        }
        this._client = null;
    }

    /**
     * Connette al database MongoDB e inizializza lo store
     * @param {string} uri URI di connessione MongoDB
     * @param {string} [dbName] Nome del database (default 'yaca')
     * @returns {Promise<AiringStateStore>}
     */
    static async connect(uri, dbName = 'yaca') {
        if (!MongoClient) {
            throw new Error('Driver MongoDB non disponibile.');
        }

        const client = new MongoClient(uri);
        await client.connect();
        const db = client.db(dbName);
        const store = new AiringStateStore(db);
        store._client = client;
        await store.initIndexes();
        return store;
    }

    /**
     * Crea gli indici secondari concordati nel contratto (ticket 07)
     */
    async initIndexes() {
        if (!this.collection || typeof this.collection.createIndex !== 'function') return;
        try {
            await this.collection.createIndex({ 'ids.kitsu': 1 });
            await this.collection.createIndex({ 'updatedAt': 1 });
            await this.collection.createIndex({ 'schedule.status': 1 });
        } catch (err) {
            console.warn(`[AiringStateStore] Avviso creazione indici: ${err.message}`);
        }
    }

    /**
     * Upsert con merge incrementale per _id (TMDB ID stringa).
     * Se il documento esiste già (es. stagione precedente salvata prima),
     * fonde gli episodi e i canali sub/dub senza perdere dati storici.
     * 
     * @param {Object} document Documento anime_airing_state in arrivo
     * @returns {Promise<Object>} Risultato dell'operazione e documento finale fuso
     */
    async upsert(document) {
        if (!document || !document._id) {
            throw new Error('Documento non valido o privo del campo _id');
        }

        if (!this.collection) {
            throw new Error('AiringStateStore non collegato ad alcuna collection MongoDB');
        }

        const existing = await this.getById(document._id);
        const finalDoc = existing ? mergeAiringDocuments(existing, document) : document;

        const res = await this.collection.updateOne(
            { _id: String(finalDoc._id) },
            { $set: finalDoc },
            { upsert: true }
        );

        return {
            acknowledged: res.acknowledged !== false,
            upsertedId: res.upsertedId || (existing ? null : finalDoc._id),
            matchedCount: res.matchedCount || (existing ? 1 : 0),
            modifiedCount: res.modifiedCount || (existing ? 1 : 0),
            document: finalDoc
        };
    }

    /**
     * Recupera un documento per TMDB ID
     * @param {string|number} id 
     * @returns {Promise<Object|null>}
     */
    async getById(id) {
        if (!this.collection || typeof this.collection.findOne !== 'function') return null;
        return await this.collection.findOne({ _id: String(id) });
    }

    /**
     * Chiude la connessione se creata internamente
     */
    async close() {
        if (this._client) {
            await this._client.close();
            this._client = null;
        }
    }
}

module.exports = {
    AiringStateStore,
    DEFAULT_COLLECTION_NAME
};
