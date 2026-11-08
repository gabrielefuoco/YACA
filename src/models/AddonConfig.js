const mongoose = require('mongoose');

/**
 * AddonConfig: The read-only, 100% anonymous profile for Stremio.
 * Exposes addon configuration to Stremio safely.
 * If this URL is shared, no sensitive data is compromised.
 *
 * IMPORTANT: This document is completely decoupled from user identity.
 * The relationship is strictly unidirectional:
 *   - UserAccount "knows" which UUID it owns (addonUuid).
 *   - AddonConfig only knows its own uuid.
 * When the backend needs to join, it queries:
 *   AddonConfig.findOne({ uuid: userAccount.addonUuid })
 *
 * Primary Key: uuid (corresponds to addonUuid in UserAccount).
 */

// Explicit subdocument schema for catalog objects (created by profileProcessor).
const catalogSchema = new mongoose.Schema({
    id: { type: String, required: true },
    name: String,
    type: String,
    source: String,
    filters: mongoose.Schema.Types.Mixed,
    queries: [mongoose.Schema.Types.Mixed],
    raw_prompt: String,
    emoji: String,
    isAnime: Boolean
}, { _id: false });

/**
 * I cinque modi del ticket 01. Il modello non importa `src/profile/modo.js`
 * per non invertire la dipendenza modello -> profilo: l'elenco qui è la
 * dichiarazione di persistenza, la derivazione delle leve vive nel profilo.
 */
const MODI = ['generale', 'film', 'serie', 'anime', 'bambini'];

/**
 * Voce dei cataloghi attivi di una modalità (ticket 01/06): l'ID del catalogo e
 * la sua posizione nell'ordine. La definizione del catalogo non si duplica qui.
 */
const voceCatalogoModoSchema = new mongoose.Schema({
    id: { type: String, required: true },
    ordine: { type: Number, default: 0 }
}, { _id: false });

function cataloghiPerModoSchema() {
    const forma = {};
    for (const modo of MODI) {
        forma[modo] = [voceCatalogoModoSchema];
    }
    return forma;
}

/**
 * DNA: stessi campi sia sul profilo legacy sia a livello account (ticket 02).
 * La funzione evita di condividere lo stesso oggetto schema fra i due path.
 */
function dnaFields() {
    return {
        genres: { type: Map, of: Number },
        keywords: { type: Map, of: Number },
        networks: { type: Map, of: Number }
    };
}

const addonConfigSchema = new mongoose.Schema({
    uuid: { type: String, required: true, unique: true, index: true },
    // REMOVED: userId — this document must remain 100% anonymous.
    // The join is done via UserAccount.addonUuid → AddonConfig.uuid.

    profiles: [{
        id: { type: String, required: true },
        name: { type: String, required: true },
        /** Emoji scelta dall'utente, separata dal nome: sopravvive al rename. */
        emoji: String,
        /**
         * Modalità del profilo (ticket 01). Non è `required`: i documenti già
         * salvati non hanno il campo e devono continuare a essere validi. Quando
         * è presente deve essere uno dei cinque valori, e il percorso di update
         * lo rende immutabile (src/models/UserConfig.js).
         */
        modo: { type: String, enum: MODI },
        // Catalogs are objects created by profileProcessor: { id, name, type }
        catalogs: {
            type: [catalogSchema],
            validate: {
                validator: function (v) {
                    if (!v || !Array.isArray(v)) return true;
                    const ids = v.map(c => c.id).filter(Boolean);
                    const uniqueIds = new Set(ids);
                    return ids.length === uniqueIds.size;
                },
                message: 'I cataloghi all\'interno di un profilo devono avere ID univoci.'
            }
        },
        settings: {
            language: String,
            includeAdult: Boolean,
            kidsMode: Boolean,
            fastPresetRefresh: Boolean,
            region: String,
            tmdbKey: String,
            erdbConfig: String,
            manualDNA: [mongoose.Schema.Types.Mixed],
            suggestedDNA: [mongoose.Schema.Types.Mixed],
            // Scritto da updateSyncTimestamp: senza la dichiarazione, strict lo scarta.
            lastSync: Date,
            typeSelectors: {
                film: { type: Boolean, default: false },
                serie: { type: Boolean, default: false },
                anime: { type: String, enum: ['only', 'exclude', null], default: null }
            }
        },
        raw_ui_state: mongoose.Schema.Types.Mixed, // Ok to leave Mixed for frontend UI state

        // DNA: Inferred taste traits from ProfileBuilder.
        // Uses Map<String, Number> so Mongoose validates that all scores are numeric.
        dna: dnaFields()
    }],
    customCatalogs: [catalogSchema],
    config: {
        activeProfileId: String,
        /**
         * Modalità attiva (ticket 01): con `MODI_ABILITATI` acceso è questa la
         * verità, e `activeProfileId` resta la casella corrispondente. I documenti
         * legacy non ce l'hanno: la lettura ricade sul `modo` del profilo attivo.
         */
        activeModo: { type: String, enum: MODI },
        /**
         * Cataloghi attivi per modalità (ticket 01/06): ogni modo ha il suo elenco
         * e il suo ordine, così un catalogo incompatibile non può esistere.
         */
        cataloghi: cataloghiPerModoSchema(),
        /**
         * Cursori d'account (ticket 01/02): unici per account, non per profilo.
         * Assenti nei documenti legacy; la lettura ricade sui valori del profilo
         * attivo (src/profile/modo.js: leggiSliders).
         */
        sliders: {
            tonalita: Number,
            notorieta: Number
        },
        configVersion: String,
        manifestFingerprint: String,
        pendingStremioResync: { type: Boolean, default: false },
        // Bookkeeping del sync Stremio scritto da updateSyncTimestamp (ora in src/stremio/collection.js):
        // se non sono dichiarati qui, mongoose in strict li elimina dall'update, che resta vuoto,
        // e MongoDB rifiuta l'arrayFilters di `profiles.$[elem]` facendo fallire tutto il sync.
        lastStremioSync: Date,
        nextSyncInterval: Number
    },
    /**
     * DNA dell'account (ticket 02): uno solo, calcolato su tutta la storia.
     * Stessa forma del DNA che i profili portavano prima. Nessun consumatore lo
     * legge ancora; `calcolaDnaAccount` è in dry-run per default.
     */
    dna: dnaFields(),
    syncStatus: {
        isSyncing: { type: Boolean, default: false },
        total: { type: Number, default: 0 },
        current: { type: Number, default: 0 },
        lastSync: Date,
        lastLibrarySync: Date
    }
}, { timestamps: true });

module.exports = mongoose.models.AddonConfig || mongoose.model('AddonConfig', addonConfigSchema);
