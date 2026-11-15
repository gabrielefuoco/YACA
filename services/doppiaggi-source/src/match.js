/**
 * match.js
 * Riconciliazione dei titoli di Antonio Genna con il catalogo YACA.
 *
 * Scala di match (secondo ricerche/scala-di-match.md §8):
 * - true se il titolo normalizzato ha UN SOLO candidato nel catalogo;
 * - true se l'anno esatto ne lascia UNO fra gli omonimi;
 * - true se la zona->tipo ne lascia UNO fra gli omonimi;
 * - fuzzy stretto per voci senza candidato (contenimento di token A⊆B o B⊆A,
 *   e se il token in comune è uno solo deve avere df <= 3; altrimenti scartato come rumore);
 * - altrimenti null (indecisione da omonimia: la scheda non si attribuisce, null su tutti i candidati);
 * - I record del catalogo che nessuna voce tocca restano false.
 */

const fs = require('fs');
const readline = require('readline');
const { normBase } = require('./parse');

const STOPWORDS = new Set([
    'il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'uno', 'una', 'l',
    'the', 'a', 'an',
    'di', 'del', 'dello', 'della', 'dei', 'degli', 'delle', 'da', 'dal', 'dalla',
    'in', 'nel', 'nella', 'con', 'su', 'per', 'tra', 'fra',
    'e', 'ed', 'o',
    'al', 'allo', 'alla', 'ai', 'agli', 'alle',
    'of', 'on', 'to', 'and', 'or',
    'el', 'los', 'las', 'de', 'du', 'des', 'les'
]);

/**
 * Estrae i token significativi per il fuzzy containment.
 * @param {string} key 
 * @returns {string[]}
 */
function extractTokens(key) {
    if (!key) return [];
    return key.split(' ').filter((t) => t && t.length > 1 && !STOPWORDS.has(t));
}

/**
 * Verifica il contenimento stretto di token (A⊆B o B⊆A).
 * Include guardia sul rapporto di lunghezza e vincoli sui singoli token.
 * @param {string[]} cardToks 
 * @param {string[]} recToks 
 * @param {function(string): number} dfFn 
 * @returns {boolean}
 */
function isStrictContainment(cardToks, recToks, dfFn) {
    if (!cardToks || !recToks || !cardToks.length || !recToks.length) return false;

    const setA = new Set(cardToks);
    const setB = new Set(recToks);

    const inter = [...setA].filter((t) => setB.has(t));
    if (inter.length === 0) return false;

    const aInB = [...setA].every((t) => setB.has(t));
    const bInA = [...setB].every((t) => setA.has(t));
    if (!aInB && !bInA) return false;

    // ponytail: guardia di lunghezza invece dello score IDF-Dice; ceiling: two similar-length titles sharing 2 tokens still match.
    const minSize = Math.min(setA.size, setB.size);
    const maxSize = Math.max(setA.size, setB.size);
    if (minSize / maxSize < 0.5) return false;

    // Se c'è un solo token in comune, deve essere raro (df <= 3), lungo >= 4 caratteri
    // e il titolo più lungo non può avere più di 2 token
    if (inter.length === 1) {
        const t = inter[0];
        const dfVal = typeof dfFn === 'function' ? dfFn(t) : 0;
        if (t.length < 4 || dfVal > 3 || maxSize > 2) return false;
    }

    return true;
}

/**
 * Disambigua fra candidati omonimi per anno.
 * Priorità assoluta ad anno esatto; tolleranza ±1 anno ammessa solo se il tipo coincide,
 * c'è un solo candidato a distanza 1 e nessun candidato a distanza 2-4 anni.
 * @param {Array<object>} candidates 
 * @param {number|null} agYear 
 * @param {string} agType 
 * @returns {{ hit: object, reason: string } | null}
 */
function resolveByYearWithMargin(candidates, agYear, agType) {
    if (!Array.isArray(candidates) || candidates.length === 0 || agYear === null || agYear === undefined) {
        return null;
    }
    const numYear = typeof agYear === 'number' ? agYear : parseInt(agYear, 10);
    if (isNaN(numYear)) return null;

    // 1. Anno esatto (priorità assoluta)
    const exact = candidates.filter((c) => c.year === numYear);
    if (exact.length === 1) return { hit: exact[0], reason: 'R2_exact_year' };
    if (exact.length > 1) {
        const exactByType = exact.filter((c) => c.type === agType);
        if (exactByType.length === 1) return { hit: exactByType[0], reason: 'R2_exact_year_and_type' };
        return null;
    }

    // 2. Tolleranza ±1 anno solo se il tipo coincide e non c'è nessun candidato a distanza 2-4 anni
    if (!agType) return null;
    const sameType = candidates.filter((c) => c.type === agType && typeof c.year === 'number' && !isNaN(c.year));
    const near = sameType.filter((c) => Math.abs(c.year - numYear) === 1);
    const othersNear = sameType.filter((c) => {
        const dist = Math.abs(c.year - numYear);
        return dist >= 2 && dist <= 4;
    });

    if (near.length === 1 && othersNear.length === 0) {
        return { hit: near[0], reason: 'R2_year_margin_1yr' };
    }
    return null;
}

/**
 * Carica e normalizza i record di catalogo da file JSONL (stream per efficienza memoria).
 * @param {string} moviesPath 
 * @param {string} tvPath 
 * @param {number} [limit] 
 * @returns {Promise<Array<{ id: string, type: 'movie'|'series', title: string, year: number|null, key: string, toks: string[] }>>}
 */
async function loadCatalogFromJsonl(moviesPath, tvPath, limit = null) {
    const records = [];

    async function processFile(filePath, type) {
        if (!fs.existsSync(filePath)) return;
        const fileStream = fs.createReadStream(filePath);
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        for await (const line of rl) {
            if (limit && records.length >= limit) break;
            const trimmed = line.trim();
            if (!trimmed) continue;

            try {
                const o = JSON.parse(trimmed);
                const title = type === 'movie' ? o.title : o.name;
                if (!title) continue;

                const dateStr = type === 'movie' ? o.release_date : o.first_air_date;
                const year = dateStr ? parseInt(String(dateStr).slice(0, 4), 10) : null;
                const key = normBase(title);
                if (!key) continue;

                records.push({
                    id: `tmdb:${type === 'movie' ? 'movie' : 'tv'}:${o.id}`,
                    type,
                    title,
                    year: isNaN(year) ? null : year,
                    key,
                    toks: extractTokens(key)
                });
            } catch (_) {
                // ignora riga corrotta
            }
        }
    }

    if (moviesPath) await processFile(moviesPath, 'movie');
    if (tvPath) await processFile(tvPath, 'series');

    return records;
}

/**
 * Esegue la riconciliazione tra catalogo e voci Antonio Genna.
 * @param {Array<object>} catalogRecords Record del catalogo YACA
 * @param {Array<object>} agEntries Voci estratte dagli indici AG
 * @returns {{
 *   catalogStats: { total: number, trueCount: number, nullCount: number, falseCount: number },
 *   agStats: { totalExtracted: number, matchedTrue: number, ambiguousNull: number, unmatchedZero: number },
 *   annotations: Array<{ id: string, type: string, title: string, year: number|null, ita: boolean|null, matchReason?: string }>,
 *   agResults: Array<{ agEntry: object, status: true|null, matchedId: string|null, reason: string }>
 * }}
 */
function matchCatalog(catalogRecords, agEntries) {
    // 1. Indicizzazione del catalogo per titolo normalizzato e token fuzzy
    const byKey = new Map();
    const byToken = new Map();

    for (let i = 0; i < catalogRecords.length; i++) {
        const rec = catalogRecords[i];
        if (!byKey.has(rec.key)) {
            byKey.set(rec.key, []);
        }
        byKey.get(rec.key).push(rec);

        const uniqueToks = new Set(rec.toks);
        for (const t of uniqueToks) {
            if (!byToken.has(t)) {
                byToken.set(t, []);
            }
            byToken.get(t).push(i);
        }
    }

    const df = (t) => (byToken.get(t) || []).length;

    // Tracciamento decisioni
    const matchedRecordIds = new Set();
    const ambiguousRecordIds = new Set();
    const agResults = [];

    let agMatchedTrue = 0;
    let agAmbiguousNull = 0;
    let agUnmatchedZero = 0;

    // 2. Scala di match per ciascuna voce AG
    for (const ag of agEntries) {
        const cands = byKey.get(ag.key) || [];

        // R1: Titolo normalizzato ha UN SOLO candidato nel catalogo
        if (cands.length === 1) {
            const hit = cands[0];
            matchedRecordIds.add(hit.id);
            agMatchedTrue++;
            agResults.push({ agEntry: ag, status: true, matchedId: hit.id, reason: 'R1_single_candidate' });
            continue;
        }

        // Se ci sono più candidati (omonimia)
        if (cands.length > 1) {
            let resolved = null;
            let reason = null;

            // R2: Anno esatto o tolleranza ±1 con margine >= 5 anni rispetto agli altri omonimi dello stesso tipo
            if (ag.year !== null) {
                const yearRes = resolveByYearWithMargin(cands, ag.year, ag.type);
                if (yearRes) {
                    resolved = yearRes.hit;
                    reason = yearRes.reason;
                }
            }

            // R3: La zona->tipo ne lascia uno solo fra più omonimi
            if (!resolved) {
                const typeMatches = cands.filter((c) => c.type === ag.type);
                if (typeMatches.length === 1) {
                    resolved = typeMatches[0];
                    reason = 'R3_zone_type';
                }
            }

            if (resolved) {
                matchedRecordIds.add(resolved.id);
                agMatchedTrue++;
                agResults.push({ agEntry: ag, status: true, matchedId: resolved.id, reason });
            } else {
                // R4: Omonimo non risolvibile: indecisione -> null su TUTTI i candidati
                cands.forEach((c) => ambiguousRecordIds.add(c.id));
                agAmbiguousNull++;
                agResults.push({ agEntry: ag, status: null, matchedId: null, reason: 'R4_unresolved_homonym' });
            }
            continue;
        }

        // cands.length === 0: Voci senza candidato -> tentiamo il fuzzy stretto
        const cardToks = extractTokens(ag.key);
        let fuzzyResolved = null;
        let fuzzyReason = null;

        if (cardToks.length > 0) {
            // Cerca le posting del token più raro della voce AG
            const sortedByDf = [...cardToks].sort((x, y) => df(x) - df(y));
            const rareTok = sortedByDf[0];
            const postings = byToken.get(rareTok) || [];

            const hits = postings
                .map((idx) => catalogRecords[idx])
                .filter((r) => isStrictContainment(cardToks, r.toks, df));

            if (hits.length === 1) {
                fuzzyResolved = hits[0];
                fuzzyReason = 'fuzzy_strict_single';
            } else if (hits.length > 1) {
                // Se il fuzzy trova più candidati, proviamo con anno e tipo
                if (ag.year !== null) {
                    const yMatches = hits.filter((c) => c.year === ag.year);
                    if (yMatches.length === 1) {
                        fuzzyResolved = yMatches[0];
                        fuzzyReason = 'fuzzy_strict_year';
                    }
                }
                if (!fuzzyResolved) {
                    const tMatches = hits.filter((c) => c.type === ag.type);
                    if (tMatches.length === 1) {
                        fuzzyResolved = tMatches[0];
                        fuzzyReason = 'fuzzy_strict_type';
                    }
                }

                if (!fuzzyResolved) {
                    // Indecisione fra candidati fuzzy
                    hits.forEach((c) => ambiguousRecordIds.add(c.id));
                    agAmbiguousNull++;
                    agResults.push({ agEntry: ag, status: null, matchedId: null, reason: 'fuzzy_strict_ambiguous' });
                    continue;
                }
            }
        }

        if (fuzzyResolved) {
            matchedRecordIds.add(fuzzyResolved.id);
            agMatchedTrue++;
            agResults.push({ agEntry: ag, status: true, matchedId: fuzzyResolved.id, reason: fuzzyReason });
        } else {
            // Nessun candidato trovato nel catalogo
            agUnmatchedZero++;
            agResults.push({ agEntry: ag, status: null, matchedId: null, reason: 'no_candidate_in_db' });
        }
    }

    // 3. Assegnazione stato finale a ciascun record di catalogo:
    // - true: associato univocamente a una voce AG
    // - null: coinvolto in un'indecisione da omonimia (senza aver ottenuto un true)
    // - false: nessuna traccia AG toccata
    let trueCount = 0;
    let nullCount = 0;
    let falseCount = 0;

    const annotations = new Array(catalogRecords.length);
    for (let i = 0; i < catalogRecords.length; i++) {
        const rec = catalogRecords[i];
        let itaStatus;

        if (matchedRecordIds.has(rec.id)) {
            itaStatus = true;
            trueCount++;
        } else if (ambiguousRecordIds.has(rec.id)) {
            itaStatus = null;
            nullCount++;
        } else {
            itaStatus = false;
            falseCount++;
        }

        annotations[i] = {
            id: rec.id,
            type: rec.type,
            title: rec.title,
            year: rec.year,
            ita: itaStatus
        };
    }

    const byReason = {};
    for (const res of agResults) {
        if (res.reason) {
            byReason[res.reason] = (byReason[res.reason] || 0) + 1;
        }
    }

    return {
        catalogStats: {
            total: catalogRecords.length,
            trueCount,
            nullCount,
            falseCount
        },
        agStats: {
            totalExtracted: agEntries.length,
            matchedTrue: agMatchedTrue,
            ambiguousNull: agAmbiguousNull,
            unmatchedZero: agUnmatchedZero,
            byReason
        },
        annotations,
        agResults
    };
}

module.exports = {
    STOPWORDS,
    extractTokens,
    isStrictContainment,
    resolveByYearWithMargin,
    loadCatalogFromJsonl,
    matchCatalog
};
