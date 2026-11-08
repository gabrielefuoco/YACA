/**
 * src/profile/dnaAccount.js
 *
 * DNA dell'account (ticket 02): un solo DNA, calcolato su tutta la storia.
 * Nessun consumatore lo legge ancora e il default è dry-run: oggi questa
 * funzione non sovrascrive nulla.
 *
 * Riusa la macchina di `ProfileBuilder.recomputeVectorsForUser` con
 * `{ scrivi: false }`, che restituisce i vettori senza toccare TasteProfile.
 * I vettori dei contesti (global + profili) vengono fusi per chiave prendendo
 * il massimo: la storia viene fan-out su più contesti dal sync, quindi sommare
 * conterebbe due volte lo stesso titolo.
 */

const ProfileBuilder = require('./ProfileBuilder');
const AddonConfig = require('../models/AddonConfig');
const { accountPerAddonUuid } = require('../configurazione');

function numeroFinito(value) {
    const numero = Number(value);
    return Number.isFinite(numero) ? numero : null;
}

/**
 * Estrae da un vettore V_final le chiavi con un certo prefisso, togliendo il
 * prefisso stesso (es. `g:28` -> `genres['28']`).
 */
function estraiMappa(vector, prefisso) {
    const mappa = {};
    const target = `${prefisso}:`;
    for (const [key, value] of Object.entries(vector || {})) {
        if (!key.startsWith(target)) continue;
        const id = key.slice(target.length);
        const numero = numeroFinito(value);
        if (!id || numero === null) continue;
        mappa[id] = numero;
    }
    return mappa;
}

/**
 * Converte un vettore V_final nella forma storica del DNA sui profili:
 * { genres, keywords, networks } di Map<String, Number>.
 *
 * `o:` (origin country) finisce in `networks` perché è l'unico campo aggregato
 * disponibile nella forma richiesta; gli eventuali `n:` futuri hanno la
 * precedenza. Il motore DNA attuale non emette chiavi `n:`.
 */
function dnaMapsDaVettore(vector) {
    return {
        genres: estraiMappa(vector, 'g'),
        keywords: estraiMappa(vector, 'k'),
        networks: {
            ...estraiMappa(vector, 'o'),
            ...estraiMappa(vector, 'n')
        }
    };
}

/**
 * Fusione deterministica di più V_final: per ogni chiave vince il punteggio
 * massimo. Evita il doppio conteggio dei titoli copiati su più contesti.
 */
function unisciVettoriMassimo(vectors = []) {
    const risultato = {};
    for (const vector of vectors) {
        for (const [key, value] of Object.entries(vector || {})) {
            const numero = numeroFinito(value);
            if (numero === null) continue;
            const attuale = risultato[key];
            if (attuale === undefined || numero > attuale) {
                risultato[key] = numero;
            }
        }
    }
    return risultato;
}

function contestiDi(addonConfig) {
    const contesti = new Set(['global']);
    for (const profilo of (addonConfig?.profiles || [])) {
        if (profilo?.id !== undefined && profilo?.id !== null && String(profilo.id).trim()) {
            contesti.add(String(profilo.id));
        }
    }
    return Array.from(contesti);
}

async function risolviOwner(addonConfig, ownerEsplicito) {
    if (ownerEsplicito) return ownerEsplicito;
    if (addonConfig?.owner) return addonConfig.owner;
    if (addonConfig?.userId) return addonConfig.userId;
    if (!addonConfig?.uuid) return null;

    try {
        const account = await accountPerAddonUuid(addonConfig.uuid);
        return account?.userId || null;
    } catch (_err) {
        return null;
    }
}

function assegnaDna(addonConfig, dna) {
    if (!addonConfig || typeof addonConfig !== 'object') return;
    addonConfig.dna = dna;
}

/**
 * Calcola una volta per account il DNA aggregato dei contesti.
 *
 * @param {object} addonConfig documento AddonConfig (o fixture equivalente)
 * @param {{scrivi?: boolean, owner?: string|null}} [options]
 * @returns {Promise<{genres: object, keywords: object, networks: object}>}
 */
async function calcolaDnaAccount(addonConfig, options = {}) {
    const scrivi = options?.scrivi === true;
    const owner = await risolviOwner(addonConfig, options?.owner);
    const vettori = [];

    if (owner) {
        for (const contesto of contestiDi(addonConfig)) {
            const risultato = await ProfileBuilder.recomputeVectorsForUser(owner, contesto, { scrivi: false });
            if (risultato?.vFinal && Object.keys(risultato.vFinal).length > 0) {
                vettori.push(risultato.vFinal);
            }
        }
    }

    const dna = dnaMapsDaVettore(unisciVettoriMassimo(vettori));

    if (scrivi) {
        assegnaDna(addonConfig, dna);
        if (addonConfig?.uuid && AddonConfig && typeof AddonConfig.updateOne === 'function') {
            await AddonConfig.updateOne({ uuid: addonConfig.uuid }, { $set: { dna } });
        }
    }

    return dna;
}

module.exports = {
    calcolaDnaAccount,
    dnaMapsDaVettore,
    unisciVettoriMassimo,
    contestiDi
};
