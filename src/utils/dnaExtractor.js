const { isRetiredTmdbKeywordId } = require('../data/keywordIds');

function extractStaticDNAFromQueries(queries) {
    const V_static = {};
    const baseWeight = 100; // Peso fisso per le intenzioni iniziali

    if (!queries || !Array.isArray(queries)) return V_static;

    queries.forEach(query => {
        if (query.with_genres) {
            query.with_genres.toString().split(/[,|]/).forEach(id => {
                if (!id.trim()) return;
                const k = `g:${id.trim()}`;
                V_static[k] = (V_static[k] || 0) + baseWeight;
            });
        }
        if (query.with_keywords) {
            const kwIds = query.with_keywords.toString()
                .split(/[,|]/)
                .map(id => id.trim())
                .filter(id => id && !isRetiredTmdbKeywordId(id));
            const HierarchicalGraph = require('../engines/graph/HierarchicalGraph');
            const hVector = HierarchicalGraph.vectorizeKeywords(kwIds);
            for (const [k, weight] of Object.entries(hVector)) {
                V_static[k] = (V_static[k] || 0) + (baseWeight * weight);
            }
        }
        if (query.keyword) {
            query.keyword.toString().split(/[,|]/).forEach(kwd => {
                if (!kwd.trim()) return;
                const k = `k:${kwd.trim().toLowerCase()}`;
                V_static[k] = (V_static[k] || 0) + baseWeight;
            });
        }
        // NOTA: cast e crew (persone) non entrano nel DNA: lo rendevano troppo restrittivo.
        // Restano solo generi, keyword e paese d'origine.
        if (query.with_origin_country) {
            query.with_origin_country.toString().split(/[,|]/).forEach(id => {
                if (!id.trim()) return;
                const k = `o:${id.trim()}`;
                V_static[k] = (V_static[k] || 0) + baseWeight;
            });
        }

        // Il "Dizionario Rosetta": Traduce i preset Kitsu in DNA TMDB
        if (query.provider === 'kitsu') {
            // Un utente che usa Kitsu sta chiaramente cercando Anime (Genere: Animation = 16)
            V_static['g:16'] = (V_static['g:16'] || 0) + baseWeight;
            // Aggiungiamo anche il paese "JP" per rafforzare l'identità Anime nel DNA
            V_static['o:JP'] = (V_static['o:JP'] || 0) + baseWeight;

            // Se ci sono categorie Kitsu testuali, proviamo a mapparle (es. "isekai")
            if (query._keywordNames) {
                query._keywordNames.split(/[,|]/).forEach(cat => {
                    const cleanCat = cat.trim().toLowerCase();
                    if (!cleanCat) return;
                    // Aggiungiamo la stringa come keyword (k:string).
                    // TMDB e YACA supportano anche DNA su stringhe, non solo ID interi
                    const k = `k:${cleanCat}`;
                    V_static[k] = (V_static[k] || 0) + baseWeight;
                });
            }
        }
    });

    return V_static;
}

function extractActiveDNAFromTmdbData(tmdbData, baseWeight = 100) {
    const dna = {};
    if (!tmdbData) return dna;

    const addKey = (prefix, id) => {
        if (!id) return;
        const k = `${prefix}:${id}`;
        dna[k] = (dna[k] || 0) + baseWeight;
    };

    // Generi (supporta format raw TMDB e le forme normalizzate del parquet DuckDB)
    const genreIds = tmdbData.genre_ids || (tmdbData.genres ? tmdbData.genres.map(g => g.id) : []);
    genreIds.forEach(id => addKey('g', id));

    // Keyword (Gerarchiche tramite HierarchicalGraph)
    const rawKeywordItems = Array.isArray(tmdbData.keywords)
        ? tmdbData.keywords
        : (Array.isArray(tmdbData.keywords?.results) && tmdbData.keywords.results.length > 0
            ? tmdbData.keywords.results
            : (tmdbData.keywords?.keywords || []));
    const keywordIds = (tmdbData.keyword_ids || rawKeywordItems.map(k => k?.id ?? k))
        .filter(id => !isRetiredTmdbKeywordId(id));
    
    const HierarchicalGraph = require('../engines/graph/HierarchicalGraph');
    const hVector = HierarchicalGraph.vectorizeKeywords(keywordIds);
    for (const [k, weight] of Object.entries(hVector)) {
        dna[k] = (dna[k] || 0) + (baseWeight * weight);
    }

    // Registi e cast non alimentano più il DNA (scelta di prodotto: le persone lo
    // rendevano troppo restrittivo). Le chiavi `d:`/`a:` eventualmente presenti nei
    // vettori già salvati vengono comunque scartate da normalizeVector.

    // Origin Country
    const countries = tmdbData.origin_country || [];
    countries.forEach(id => addKey('o', id));

    return dna;
}

/**
 * Chiavi DNA relative alle persone (cast `a:` e crew `d:`).
 * Non devono influenzare il DNA: vengono scartate sia in generazione sia in lettura.
 */
function isPersonDnaKey(key) {
    return typeof key === 'string' && (key.startsWith('a:') || key.startsWith('d:'));
}

function stripPersonKeys(vector) {
    if (!vector || typeof vector !== 'object') return vector || {};
    const clean = {};
    for (const [key, value] of Object.entries(vector)) {
        if (isPersonDnaKey(key)) continue;
        clean[key] = value;
    }
    return clean;
}

function normalizeVector(vector) {
    const withoutPersons = stripPersonKeys(vector);
    if (!withoutPersons || typeof withoutPersons !== 'object') return {};
    const sum = Object.values(withoutPersons).reduce((a, b) => a + Number(b || 0), 0);
    if (sum === 0) return {};
    
    const normalized = {};
    for (let key in withoutPersons) {
        normalized[key] = Number(withoutPersons[key] || 0) / sum;
    }
    return normalized;
}

function computeFinalDNA(V_static, V_active, totalInteractions) {
    const normStatic = normalizeVector(V_static || {}); 
    const normActive = normalizeVector(V_active || {});

    // Curva di apprendimento
    const threshold = 50; 
    const maxActiveWeight = 0.85; 

    const activeWeight = Math.min((totalInteractions || 0) / threshold, 1) * maxActiveWeight;
    const staticWeight = 1 - activeWeight;

    const V_final = {};
    const allKeys = new Set([...Object.keys(normStatic), ...Object.keys(normActive)]);

    for (let key of allKeys) {
        const staticVal = normStatic[key] || 0;
        const activeVal = normActive[key] || 0;
        // Salvo moltiplicando per 100 per avere un numero più leggibile (opzionale, ma aiuta)
        V_final[key] = ((staticVal * staticWeight) + (activeVal * activeWeight)) * 100;
    }

    return V_final;
}

module.exports = { extractStaticDNAFromQueries, extractActiveDNAFromTmdbData, computeFinalDNA, normalizeVector, stripPersonKeys, isPersonDnaKey };
