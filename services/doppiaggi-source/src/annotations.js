/**
 * annotations.js
 * Gestione delle annotazioni del doppiaggio e regole di unione multi-fonte.
 *
 * REGOLE DI MERGE (Ticket 04, D4 e Ticket 07):
 * Unione tra le annotazioni base (Il Mondo dei Doppiatori - Antonio Genna)
 * e le annotazioni addizionali (AnimeUnity via anime_airing_state).
 *
 * Contratto:
 *   mergeAnnotationRows(base, extra)
 * - Chiave primaria: (t, id)  [t: 'movie' | 'tv', id: numero TMDB]
 * - Precedenza: true > null > assente
 * - Se AnimeUnity dichiara un anime doppiato (true), quell'id vince su un eventuale
 *   null di Antonio Genna (ambiguità/omonimia irrisolta risolta per via indipendente).
 * - Mai declassare un true: se un titolo è già true in base o in extra, resta true.
 * - Le righe finali sono ordinate stabilmente per (t, id) [movie prima di tv, poi per id crescente].
 */

/**
 * Normalizza e unisce per chiave (t, id) due liste di righe di annotazione.
 *
 * @param {Array<{t: string, id: number, ita: boolean|null}>} base Righe base (es. Antonio Genna)
 * @param {Array<{t: string, id: number, ita: boolean|null}>} extra Righe extra (es. anime_airing_state)
 * @returns {Array<{t: string, id: number, ita: boolean|null}>} Righe risultanti ordinate per (t, id)
 */
function mergeAnnotationRows(base = [], extra = []) {
    const map = new Map();

    const applyRow = (row) => {
        if (!row || (row.ita !== true && row.ita !== null)) return;
        const t = row.t === 'movie' || row.t === 'tv' ? row.t : null;
        const id = Number(row.id);
        if (!t || !Number.isFinite(id)) return;

        const key = `${t}:${id}`;
        const existing = map.get(key);

        if (!existing) {
            map.set(key, { t, id, ita: row.ita });
        } else {
            // Precedenza: true > null > assente. Mai declassare un true.
            if (existing.ita === true || row.ita === true) {
                existing.ita = true;
            } else if (existing.ita === null || row.ita === null) {
                existing.ita = null;
            }
        }
    };

    for (const r of base || []) {
        applyRow(r);
    }
    for (const r of extra || []) {
        applyRow(r);
    }

    const merged = Array.from(map.values());
    merged.sort((a, b) => (a.t === b.t ? a.id - b.id : a.t < b.t ? -1 : 1));
    return merged;
}

/**
 * Calcola le statistiche dettagliate del merge tra base ed extra.
 * Utile per reporting, log CLI e metriche di osservabilità.
 *
 * @param {Array<{t: string, id: number, ita: boolean|null}>} base
 * @param {Array<{t: string, id: number, ita: boolean|null}>} extra
 * @returns {{
 *   totalBase: number,
 *   totalExtra: number,
 *   totalMerged: number,
 *   mergedTrue: number,
 *   mergedNull: number,
 *   addedRows: number,
 *   promotedRows: number,
 *   alreadyTrue: number,
 *   downgradedRows: number
 * }}
 */
function inspectMerge(base = [], extra = []) {
    const baseMap = new Map();
    for (const r of base || []) {
        if (!r || (r.ita !== true && r.ita !== null)) continue;
        const t = r.t;
        const id = Number(r.id);
        if (t && Number.isFinite(id)) {
            baseMap.set(`${t}:${id}`, r.ita);
        }
    }

    let addedRows = 0;
    let promotedRows = 0;
    let alreadyTrue = 0;
    let downgradedRows = 0;

    for (const r of extra || []) {
        if (!r || (r.ita !== true && r.ita !== null)) continue;
        const t = r.t;
        const id = Number(r.id);
        if (!t || !Number.isFinite(id)) continue;

        const key = `${t}:${id}`;
        const baseIta = baseMap.get(key);

        if (baseIta === undefined) {
            addedRows++;
        } else if (baseIta === null && r.ita === true) {
            promotedRows++;
        } else if (baseIta === true && r.ita === true) {
            alreadyTrue++;
        } else if (baseIta === true && r.ita === null) {
            // Non declassa: resta true
        }
    }

    const merged = mergeAnnotationRows(base, extra);
    const mergedTrue = merged.filter((r) => r.ita === true).length;
    const mergedNull = merged.filter((r) => r.ita === null).length;

    return {
        totalBase: baseMap.size,
        totalExtra: (extra || []).filter((r) => r && (r.ita === true || r.ita === null)).length,
        totalMerged: merged.length,
        mergedTrue,
        mergedNull,
        addedRows,
        promotedRows,
        alreadyTrue,
        downgradedRows
    };
}

module.exports = {
    mergeAnnotationRows,
    inspectMerge
};
