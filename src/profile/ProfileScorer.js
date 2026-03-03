class ProfileScorer {
    /**
     * Calcola l'affinità di un contenuto TMDB con il profilo di gusto dell'utente.
     * @param {Object} tmdbData Dati grezzi TMDB (arricchiti con credits e keywords)
     * @param {Object} profile Documento Mongoose TasteProfile
     * @returns {Number} Score da 0.0 a 10.0
     */
    /**
     * Calcola l'affinità di un contenuto TMDB con il profilo di gusto dell'utente.
     * @param {Object} tmdbData Dati grezzi TMDB (arricchiti con credits e keywords)
     * @param {Object} profile Documento Mongoose TasteProfile
     * @param {Object} overrides Opzionali { tmdbWeight, traktWeight }
     * @returns {Number} Score da 0.0 a 10.0
     */
    static calculateItemMatch(tmdbData, profile, overrides = {}) {
        if (!tmdbData || !profile) return 0;

        const tmdbWeight = overrides.tmdbWeight ?? profile.tmdbWeight ?? 1.0;
        const traktWeight = overrides.traktWeight ?? profile.traktWeight ?? 1.0;

        let thematicScore = 0;
        let authorialScore = 0;

        // --- 1. Assi Tematici ---
        // Generi
        const genreIds = tmdbData.genre_ids || (tmdbData.genres ? tmdbData.genres.map(g => g.id) : []);
        genreIds.forEach(gid => {
            if (gid !== undefined && gid !== null) {
                const score = profile.genreScores.get(gid.toString()) || 0;
                thematicScore += score;
            }
        });

        // Keywords
        const keywords = tmdbData.keywords?.keywords || tmdbData.keywords?.results || [];
        if (keywords.length > 0) {
            keywords.forEach(kw => {
                if (kw && kw.id) {
                    const score = profile.keywordScores.get(kw.id.toString()) || 0;
                    thematicScore += score;
                }
            });
        }

        // --- 2. Assi Autoriali ---
        // Registi
        if (tmdbData.credits && tmdbData.credits.crew) {
            const directors = tmdbData.credits.crew.filter(c => c.job === 'Director');
            directors.forEach(d => {
                if (d && d.id) {
                    const score = profile.directorScores.get(d.id.toString()) || 0;
                    authorialScore += score;
                }
            });
        }

        // Attori
        if (tmdbData.credits && tmdbData.credits.cast) {
            tmdbData.credits.cast.slice(0, 5).forEach(a => {
                if (a && a.id) {
                    const score = profile.actorScores.get(a.id.toString()) || 0;
                    authorialScore += score;
                }
            });
        }

        // --- 3. Normalizzazione e Pesatura ---
        const profileMatch = (thematicScore * 0.4) + (authorialScore * 0.6);

        // Qualità TMDB (0.0 - 10.0)
        const voteAvg = tmdbData.vote_average || 0;
        const voteCount = tmdbData.vote_count || 0;
        const confidence = Math.min(voteCount / 200, 1.0);
        const qualityScore = voteAvg * confidence;

        // Formula Finale Bilanciata dai Pesi
        const totalWeight = tmdbWeight + traktWeight;
        if (totalWeight === 0) return 0;

        const normalizedScore = ((profileMatch * traktWeight) + (qualityScore * tmdbWeight)) / totalWeight;

        return Math.min(Math.max(normalizedScore, 0), 10);
    }


    /**
     * Applica il filtro Diversity Cap a una lista di item TMDB.
     * @param {Array} items Lista di oggetti { data: tmdbData, score: Number }
     * @param {Object} options { genreCap: 0.5, studioCap: 3 }
     * @returns {Array} Lista riordinata
     */
    static applyDiversityCaps(items, options = { genreCap: 0.5, studioCap: 3, directorCap: 3 }) {
        const sorted = [...items].sort((a, b) => b.score - a.score);
        const result = [];
        const overflow = [];

        const genreCounts = {};
        const studioCounts = {};
        const directorCounts = {};

        const pageSize = 20; // Analizziamo per "pagine" virtuali

        sorted.forEach((item, index) => {
            const data = item.data;
            let skip = false;

            // Genre Cap (supporta sia genres:[{id}] che genre_ids:[int])
            const primaryGenre = data.genres?.[0]?.id || data.genre_ids?.[0];
            if (primaryGenre) {
                genreCounts[primaryGenre] = (genreCounts[primaryGenre] || 0) + 1;
                if (genreCounts[primaryGenre] > (pageSize * options.genreCap)) skip = true;
            }

            // Studio Cap
            if (data.production_companies && data.production_companies.length > 0) {
                data.production_companies.forEach(s => {
                    studioCounts[s.id] = (studioCounts[s.id] || 0) + 1;
                    if (studioCounts[s.id] > options.studioCap) skip = true;
                });
            }

            // Director Cap
            if (data.credits && data.credits.crew) {
                const director = data.credits.crew.find(c => c.job === 'Director');
                if (director) {
                    directorCounts[director.id] = (directorCounts[director.id] || 0) + 1;
                    if (directorCounts[director.id] > options.directorCap) skip = true;
                }
            }

            if (skip) overflow.push(item);
            else result.push(item);
        });

        return [...result, ...overflow];
    }
}

module.exports = ProfileScorer;
