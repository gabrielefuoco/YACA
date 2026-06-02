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
            query.with_keywords.toString().split(/[,|]/).forEach(id => {
                if (!id.trim()) return;
                const k = `k:${id.trim()}`;
                V_static[k] = (V_static[k] || 0) + baseWeight;
            });
        }
        if (query.with_cast) {
            query.with_cast.toString().split(/[,|]/).forEach(id => {
                if (!id.trim()) return;
                const k = `a:${id.trim()}`;
                V_static[k] = (V_static[k] || 0) + baseWeight;
            });
        }
        if (query.with_crew) {
            query.with_crew.toString().split(/[,|]/).forEach(id => {
                if (!id.trim()) return;
                const k = `d:${id.trim()}`;
                V_static[k] = (V_static[k] || 0) + baseWeight;
            });
        }
        if (query.with_origin_country) {
            query.with_origin_country.toString().split(/[,|]/).forEach(id => {
                if (!id.trim()) return;
                const k = `o:${id.trim()}`;
                V_static[k] = (V_static[k] || 0) + baseWeight;
            });
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

    // Generi (supporta format raw TMDB e format cache Mongoose TmdbScoringData)
    const genreIds = tmdbData.genre_ids || (tmdbData.genres ? tmdbData.genres.map(g => g.id) : []);
    genreIds.forEach(id => addKey('g', id));

    // Keyword
    const keywordIds = tmdbData.keyword_ids || 
        (tmdbData.keywords?.keywords || tmdbData.keywords?.results || []).map(k => k.id);
    keywordIds.forEach(id => addKey('k', id));

    // Registi
    const directorIds = tmdbData.director_ids || 
        (tmdbData.credits?.crew || []).filter(c => c.job === 'Director').map(c => c.id);
    directorIds.forEach(id => addKey('d', id));

    // Cast
    const castIds = tmdbData.cast_ids || 
        (tmdbData.credits?.cast || []).slice(0, 5).map(c => c.id);
    castIds.forEach(id => addKey('a', id));

    // Origin Country
    const countries = tmdbData.origin_country || [];
    countries.forEach(id => addKey('o', id));

    return dna;
}

function normalizeVector(vector) {
    if (!vector || typeof vector !== 'object') return {};
    const sum = Object.values(vector).reduce((a, b) => a + Number(b || 0), 0);
    if (sum === 0) return {};
    
    const normalized = {};
    for (let key in vector) {
        normalized[key] = Number(vector[key] || 0) / sum;
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

module.exports = { extractStaticDNAFromQueries, extractActiveDNAFromTmdbData, computeFinalDNA, normalizeVector };
