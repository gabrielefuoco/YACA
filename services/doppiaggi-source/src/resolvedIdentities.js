const fs = require('fs');
const path = require('path');

/**
 * Le identità provate dal resolver (`--resolve-ids`) sono un **fatto**, non il risultato di un giro:
 * una scheda di cui TMDB ha confermato l'id resta confermata anche domani.
 *
 * Per questo vivono in un sidecar accanto alle annotazioni (`ita_resolved.jsonl`) e non solo nel file
 * `ita_annotations.jsonl`, che ogni giro rigenera dal matching. Senza il sidecar il giro successivo
 * perderebbe tutte le identità risolte e la guardia del writer (calo > 2%) bloccherebbe la scrittura:
 * è quello che è successo il 26/11, con il job fermo a exit 2 e 1.373 badge in bilico.
 *
 * Formato identico a una riga di annotazione: `{"t":"movie","id":5,"ita":true}`.
 */

const FILE_NAME = 'ita_resolved.jsonl';
const SCHEMA_VERSION = 1;

function resolvedPath(dataDir) {
    return path.join(dataDir, FILE_NAME);
}

/** Legge il sidecar. File assente o riga corrotta: si ignora, non si lancia mai. */
function leggiIdentitaRisolte(dataDir) {
    const file = resolvedPath(dataDir);
    if (!fs.existsSync(file)) return [];
    const out = [];
    try {
        for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
                const row = JSON.parse(trimmed);
                const t = row && (row.t === 'movie' || row.t === 'tv') ? row.t : null;
                const id = Number(row && row.id);
                if (t && Number.isFinite(id) && row.ita === true) out.push({ t, id, ita: true });
            } catch (_) {
                // riga corrotta: si salta, il resto del file vale
            }
        }
    } catch (_) {
        return [];
    }
    return out;
}

/**
 * Aggiunge identità al sidecar (dedupe per `t:id`, `true` vince). Scrittura atomica: il file è
 * piccolo (poche migliaia di righe) e va riscritto intero per deduplicare.
 */
async function aggiungiIdentitaRisolte(dataDir, righe) {
    const { scriviAtomico } = require('../../../src/infra/atomicWrite');
    const presenti = new Map();
    for (const r of leggiIdentitaRisolte(dataDir)) presenti.set(`${r.t}:${r.id}`, r);
    let aggiunte = 0;
    for (const r of righe || []) {
        const t = r && (r.t === 'movie' || r.t === 'tv') ? r.t : null;
        const id = Number(r && r.id);
        if (!t || !Number.isFinite(id) || r.ita !== true) continue;
        const key = `${t}:${id}`;
        if (presenti.has(key)) continue;
        presenti.set(key, { t, id, ita: true });
        aggiunte += 1;
    }
    if (aggiunte === 0) return { aggiunte: 0, totali: presenti.size, path: resolvedPath(dataDir) };
    const body = `${[...presenti.values()].map((r) => JSON.stringify(r)).join('\n')}\n`;
    await scriviAtomico(resolvedPath(dataDir), body);
    return { aggiunte, totali: presenti.size, path: resolvedPath(dataDir) };
}

module.exports = { FILE_NAME, SCHEMA_VERSION, resolvedPath, leggiIdentitaRisolte, aggiungiIdentitaRisolte };
