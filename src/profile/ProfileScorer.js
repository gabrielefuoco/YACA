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
     * @param {Object} profile Documento Mongoose TasteProfile (GLOBAL)
     * @param {Object} context Opzionali { dnaFilters (User.profiles.settings), tmdbWeight, traktWeight }
     * @returns {Number} Score da 0.0 a 10.0
     */
    static calculateItemMatch(tmdbData, profile, context = {}) {
        if (!tmdbData || !profile) return 0;

        const tmdbWeight = context.tmdbWeight ?? profile.tmdbWeight ?? 1.0;
        const traktWeight = context.traktWeight ?? profile.traktWeight ?? 1.0;
        const dnaFilters = context.dnaFilters; // Array di {type, id, name}

        // --- 0. Controllo DNA (Filtro Contextuale) ---
        let dnaMultiplier = 1.0;
        if (dnaFilters && dnaFilters.length > 0) {
            const genreIds = tmdbData.genre_ids || (tmdbData.genres ? tmdbData.genres.map(g => g.id.toString()) : []);
            const keywordsItems = tmdbData.keywords?.keywords || tmdbData.keywords?.results || [];

            const hasGenreMatch = dnaFilters.some(f => f.type === 'genre' && genreIds.includes(f.id));
            const hasKeywordMatch = dnaFilters.some(f => f.type === 'keyword' && keywordsItems.some(k => k.id.toString() === f.id));

            if (!hasGenreMatch && !hasKeywordMatch) {
                // Se non c'è match col DNA, penalizziamo pesantemente (es. 90% in meno)
                dnaMultiplier = 0.1;
            }
        }

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

        const normalizedScore = (((profileMatch * traktWeight) + (qualityScore * tmdbWeight)) / totalWeight) * dnaMultiplier;

        return Math.min(Math.max(normalizedScore, 0), 10);
    }

}

module.exports = ProfileScorer;
