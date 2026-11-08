/**
 * src/profile/attivazioneModi.js
 *
 * Attivazione delle modalità (ticket 01) e forma della lista che la dashboard
 * legge. Tutto qui dentro vive SOLO con `MODI_ABILITATI` acceso: le rotte che lo
 * espongono rifiutano la richiesta quando il flag è spento, così il prodotto
 * spento è identico a quello di prima (nessun campo nuovo scritto per errore).
 *
 * Regole del ticket 01 che questo modulo possiede:
 * - l'attivazione è mutuamente esclusiva per costruzione: c'è UN solo
 *   `config.activeModo`, e `config.activeProfileId` punta alla sua casella;
 * - `modo` di un profilo non si tocca mai qui: è immutabile (l'immutabilità vive
 *   in `applicaImmutabilitaModo` e nel merge di `src/models/UserConfig.js`);
 * - una modalità sconosciuta è un errore dichiarato (400), non un default muto.
 */

const { nanoid } = require('nanoid');
const AddonConfig = require('../models/AddonConfig');
const { accountDi } = require('../configurazione');
const {
    MODI,
    NOMI_MODI,
    derivaLeve,
    isModoValido,
    normalizzaModo,
    materializzaModi,
    leggiModoAttivo
} = require('./modo');
const { buildManifestFingerprint } = require('../stremio/fingerprint');

/** Messaggio onesto della propagazione (ticket 04): niente promesse in secondi. */
const MESSAGGIO_PROPAGAZIONE =
    'Modalità attivata. I cataloghi su Stremio si aggiorneranno alla prossima apertura dell\'app; ' +
    'se Stremio è già aperta, ricarica la schermata o riavvia l\'app.';

class ModoNonValidoError extends Error {
    constructor(modo) {
        super(`Modalità sconosciuta: ${modo === undefined ? '(assente)' : String(modo)}. Valori ammessi: ${MODI.join(', ')}.`);
        this.name = 'ModoNonValidoError';
        this.status = 400;
        this.code = 'modo_non_valido';
    }
}

class AccountNonTrovatoError extends Error {
    constructor() {
        super('Account utente non trovato.');
        this.name = 'AccountNonTrovatoError';
        this.status = 404;
        this.code = 'non_trovato';
    }
}

/**
 * Valida il modo in ingresso. Nessun default silenzioso: `play` non diventa
 * `play(s)` (il bug che ci è già costato un ticket).
 *
 * @param {unknown} modo
 * @returns {'generale'|'film'|'serie'|'anime'|'bambini'}
 * @throws {ModoNonValidoError}
 */
function validaModo(modo) {
    const normalizzato = normalizzaModo(modo);
    if (!isModoValido(normalizzato)) throw new ModoNonValidoError(modo);
    return normalizzato;
}

function profiliPlani(profiles) {
    return (Array.isArray(profiles) ? profiles : []).map(profilo => {
        const piano = profilo && typeof profilo.toObject === 'function' ? profilo.toObject() : { ...(profilo || {}) };
        if (piano.id === undefined && piano._id !== undefined) piano.id = String(piano._id);
        delete piano._id;
        return piano;
    });
}

/**
 * La lista delle cinque modalità con nome fisso, emoji dell'utente, chi è attiva
 * e le leve derivate. Una modalità mai materializzata compare comunque (casella
 * vuota), perché le cinque caselle esistono per contratto.
 *
 * @param {object|null} addonConfig documento (o vista equivalente)
 * @returns {{attivo: string, modi: Array<{modo: string, nome: string, emoji: string, attivo: boolean, leve: object}>}}
 */
function elencaModi(addonConfig) {
    const attivo = leggiModoAttivo(addonConfig);
    const profili = profiliPlani(addonConfig?.profiles);

    return {
        attivo,
        modi: MODI.map(modo => {
            const profilo = profili.find(p => normalizzaModo(p?.modo) === modo) || null;
            return {
                modo,
                nome: NOMI_MODI[modo],
                emoji: typeof profilo?.emoji === 'string' ? profilo.emoji : '',
                attivo: modo === attivo,
                leve: derivaLeve(modo)
            };
        })
    };
}

/**
 * Attiva una modalità. Effetti, tutti espliciti:
 * 1. materializza le caselle mancanti (idempotente) e ne persiste solo le nuove;
 * 2. `config.activeModo` diventa il modo scelto (uno solo: esclusività per costruzione);
 * 3. `config.activeProfileId` punta alla casella del modo;
 * 4. l'impronta del manifest viene ricalcolata: se cambia, `configVersion` bumpa
 *    e `pendingStremioResync` si alza (ticket 04).
 *
 * @param {{userId?: string|null, addonUuid?: string|null, modo: string}} params
 * @returns {Promise<object>} stato aggiornato (stessa forma di `elencaModi` più configVersion)
 */
async function attivaModo({ userId = null, addonUuid = null, modo } = {}) {
    const scelto = validaModo(modo);

    const uuid = addonUuid || (await accountDi(userId).catch(() => null))?.addonUuid || null;
    if (!uuid) throw new AccountNonTrovatoError();

    const documento = await AddonConfig.findOne({ uuid }).lean();
    if (!documento) throw new AccountNonTrovatoError();

    const config = documento.config && typeof documento.config === 'object' ? documento.config : {};
    const profiliPrima = profiliPlani(documento.profiles);
    const caselle = materializzaModi({ profiles: [...profiliPrima] });
    const profiliDopo = caselle.profiles;
    const profiliNuovi = profiliDopo.length !== profiliPrima.length;

    const profiloDelModo = profiliDopo.find(p => normalizzaModo(p?.modo) === scelto) || null;
    if (!profiloDelModo || profiloDelModo.id === undefined || profiloDelModo.id === null) {
        // Impossibile per costruzione (materializzaModi crea tutte e cinque le
        // caselle): se accade, è un guasto del modello, non un input sbagliato.
        throw new Error('Casella della modalità non materializzabile.');
    }
    const activeProfileId = String(profiloDelModo.id);

    const cataloghi = config.cataloghi || {};
    const nextFingerprint = buildManifestFingerprint({
        activeProfileId,
        activeModo: scelto,
        cataloghi,
        profiles: profiliDopo,
        customCatalogs: documento.customCatalogs || []
    });
    const previousFingerprint = typeof config.manifestFingerprint === 'string' ? config.manifestFingerprint : null;
    const manifestChanged = !previousFingerprint || previousFingerprint !== nextFingerprint;
    const configVersion = manifestChanged
        ? nanoid(8)
        : (config.configVersion || nanoid(8));

    const aggiornamento = {
        $set: {
            'config.activeModo': scelto,
            'config.activeProfileId': activeProfileId,
            'config.manifestFingerprint': nextFingerprint,
            'config.configVersion': configVersion,
            'config.pendingStremioResync': manifestChanged
                ? true
                : Boolean(config.pendingStremioResync)
        }
    };
    if (profiliNuovi) aggiornamento.$set.profiles = profiliDopo;

    await AddonConfig.updateOne({ uuid }, aggiornamento);

    return {
        ...elencaModi({ ...documento, profiles: profiliDopo, config: { ...config, activeModo: scelto } }),
        configVersion,
        manifestChanged,
        propagazione: manifestChanged ? MESSAGGIO_PROPAGAZIONE : null
    };
}

module.exports = {
    MESSAGGIO_PROPAGAZIONE,
    ModoNonValidoError,
    AccountNonTrovatoError,
    validaModo,
    elencaModi,
    attivaModo
};
