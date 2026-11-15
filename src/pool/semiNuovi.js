/**
 * Semi nuovi — il titolo che il grafo non conosce non si butta.
 *
 * IL PROBLEMA. Il canone è congelato: un titolo fuori canone viene scartato dal motore (ticket 19 lo
 * registra, ma resta scartato). Chi guarda un film uscito ieri non riceve consigli da quel film.
 *
 * LA SCELTA ARCHITETTURALE (ticket 22). Estendere il canone costerebbe **quattro** artefatti —
 * chiavi, metadati, assi del tono, triangolo — più `prepara`, e gli assi richiedono un modello. Qui
 * invece il titolo nuovo **non entra nel grafo**: entra come *seme espanso*. Il collocatore (ticket 21)
 * gli ha già trovato i sedici vicini nel canone; il pool li manda al motore al posto del seme
 * sconosciuto, pesati.
 *
 * Cosa si guadagna: il segnale dell'utente semina davvero, senza toccare il grafo servito.
 * Cosa non si guadagna: il titolo nuovo non è raggiungibile come *candidato* dagli altri semi (per
 * quello servirebbe la riga nel canone). Ma il suo scaffale si può servire dal sidecar.
 *
 * ROLLBACK: togliere la voce dal sidecar. Nessun artefatto da rigenerare.
 */

const fs = require('fs');
const path = require('path');

const PERCORSO_DEFAULT = path.join(
    __dirname, '..', '..', 'services', 'graph', 'data', 'collocatore', 'collocati.json'
);

let cache = { percorso: null, mtime: 0, voci: {} };

function percorso() {
    return process.env.YACA_COLLOCATI_PATH || PERCORSO_DEFAULT;
}

/**
 * Le voci del sidecar, rilette solo se il file cambia.
 * Forma: `{ "<chiave>": { medio, vicini: [{ chiave, peso }], creato } }`
 */
function caricaVoci(p = percorso()) {
    try {
        const st = fs.statSync(p);
        if (cache.percorso === p && cache.mtime === st.mtimeMs) return cache.voci;
        const dati = JSON.parse(fs.readFileSync(p, 'utf8'));
        const voci = {};
        for (const [chiave, voce] of Object.entries(dati.titoli || dati || {})) {
            const vicini = Array.isArray(voce?.vicini) ? voce.vicini : [];
            if (!vicini.length) continue;
            voci[chiave] = {
                medio: voce.medio || null,
                vicini: vicini
                    .filter(v => v && typeof v.chiave === 'string')
                    .map(v => ({ chiave: v.chiave, peso: Number(v.peso) > 0 ? Number(v.peso) : 1 })),
            };
        }
        cache = { percorso: p, mtime: st.mtimeMs, voci };
        return voci;
    } catch (_e) {
        cache = { percorso: p, mtime: 0, voci: {} };
        return {};
    }
}

/**
 * Sostituisce i semi che il canone non conosce con i loro vicini, tenendo il peso del seme originale.
 *
 * Il peso si distribuisce: ogni vicino vale `peso_seme * w / somma(w)`. Così un titolo nuovo «pesa»
 * quanto un titolo noto dello stesso segnale — non di più solo perché si è espanso in sedici.
 *
 * @param {Array<object>} semi semi del pool (con `key`, `plays`, `eta_giorni`, ...)
 * @param {object} [voci] sidecar già caricato (per i test)
 * @returns {{ semi: Array<object>, espansi: string[], scartati: string[] }}
 */
function espandiSemi(semi, voci = null) {
    const mappa = voci || caricaVoci();
    const out = [];
    const espansi = [];
    const scartati = [];
    for (const seme of Array.isArray(semi) ? semi : []) {
        const chiave = seme?.key ? String(seme.key) : null;
        const voce = chiave ? mappa[chiave] : null;
        if (!voce) {
            out.push(seme);
            continue;
        }
        const totale = voce.vicini.reduce((s, v) => s + v.peso, 0) || 1;
        const pesoBase = Number.isFinite(Number(seme.plays)) && Number(seme.plays) > 0
            ? Number(seme.plays)
            : 1;
        for (const v of voce.vicini) {
            out.push({
                key: v.chiave,
                plays: pesoBase * (v.peso / totale),
                // il segnale resta quello dell'utente: un titolo nuovo guardato ieri non diventa
                // «visto tanto tempo fa» perché l'abbiamo espanso
                ...(seme.eta_giorni !== undefined ? { eta_giorni: seme.eta_giorni } : {}),
                ...(seme.tipo ? { tipo: seme.tipo } : {}),
                da_titolo_nuovo: chiave,
            });
        }
        espansi.push(chiave);
        if (!voce.vicini.length) scartati.push(chiave);
    }
    return { semi: out, espansi, scartati };
}

module.exports = { caricaVoci, espandiSemi, percorso, PERCORSO_DEFAULT };
