// Bayesian Weighted Rating parameters (Phase 1.3)
const BAYESIAN_MIN_VOTES = 300;  // m: minimum votes threshold
const BAYESIAN_MEAN_VOTE = 6.5;  // C: mean vote across the catalogue
const ACTIVE_PROFILE_WEIGHT = 0.8;
const GLOBAL_PROFILE_WEIGHT = 0.2;

class ProfileScorer {
    static normalizeDnaId(value) {
        return String(value ?? '').replace(/^tmdb:/i, '').trim();
    }

    static computeDnaMultiplier(tmdbData, dnaFilters = []) {
        if (!Array.isArray(dnaFilters) || dnaFilters.length === 0) return 1.0;

        const genreIds = (tmdbData.genre_ids || (tmdbData.genres ? tmdbData.genres.map(g => g.id) : []))
            .map((id) => this.normalizeDnaId(id));
        const keywordItems = tmdbData.keywords?.keywords || tmdbData.keywords?.results || [];
        const keywordIds = keywordItems.map((k) => this.normalizeDnaId(k.id));

        const hasGenreMatch = dnaFilters.some(
            (f) => f.type === 'genre' && genreIds.includes(this.normalizeDnaId(f.id))
        );
        const hasKeywordMatch = dnaFilters.some(
            (f) => f.type === 'keyword' && keywordIds.includes(this.normalizeDnaId(f.id))
        );

        return hasGenreMatch || hasKeywordMatch ? 1.0 : 0.1;
    }

    static calculateBaseItemMatch(tmdbData, profile, context = {}) {
        if (!tmdbData || !profile) return 0;

        const tmdbWeight = context.tmdbWeight ?? profile.tmdbWeight ?? 1.0;
        const traktWeight = context.traktWeight ?? profile.traktWeight ?? 1.0;

        let thematicScore = 0;
        let authorialScore = 0;

        // --- 1. Assi Tematici (Phase 1.2: worth 90% of affinity score) ---
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

        // --- 2. Assi Autoriali (Phase 1.2: worth 10% as precision bonus) ---
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

        // --- 3. Phase 1.2: Rebalanced weighting (Thematic 90%, Authorial 10%) ---
        const profileMatch = (thematicScore * 0.9) + (authorialScore * 0.1);

        // --- Phase 1.3: Bayesian Weighted Rating (IMDb formula) ---
        // WR = ((v/(v+m)) * R) + ((m/(v+m)) * C)
        const voteAvg = tmdbData.vote_average || 0;
        const voteCount = tmdbData.vote_count || 0;
        const m = BAYESIAN_MIN_VOTES;
        const C = BAYESIAN_MEAN_VOTE;
        const bayesianScore = ((voteCount / (voteCount + m)) * voteAvg) + ((m / (voteCount + m)) * C);

        // --- Phase 1.4: Epsilon Tracker (deterministic daily rotation) ---
        const tmdbId = tmdbData.id || 0;
        // Use start of UTC day to ensure epsilon stays constant throughout the day
        const dayOfYear = Math.floor(new Date().setUTCHours(0, 0, 0, 0) / (1000 * 60 * 60 * 24));
        const epsilon = ((tmdbId * dayOfYear) % 1000) * 0.000001;

        // --- 4. Formula Finale Bilanciata dai Pesi ---
        const totalWeight = tmdbWeight + traktWeight;
        if (totalWeight === 0) return 0;

        const normalizedScore = ((profileMatch * traktWeight) + (bayesianScore * tmdbWeight)) / totalWeight;
        return Math.min(Math.max(normalizedScore + epsilon, 0), 10);
    }

    /**
     * Calcola l'affinità di un contenuto TMDB con il profilo di gusto dell'utente.
     * @param {Object} tmdbData Dati grezzi TMDB (arricchiti con credits e keywords)
     * @param {Object} profile Documento Mongoose TasteProfile (GLOBAL)
     * @param {Object} context Opzionali { dnaFilters (User.profiles.settings), tmdbWeight, traktWeight }
     * @returns {Number} Score da 0.0 a 10.0
     */
    static calculateItemMatch(tmdbData, profile, context = {}) {
        if (!tmdbData || !profile) return 0;

        const dnaMultiplier = this.computeDnaMultiplier(tmdbData, context.dnaFilters);
        const profileScore = this.calculateBaseItemMatch(tmdbData, profile, context);
        const globalProfile = context.globalProfile;

        if (globalProfile) {
            const globalScore = this.calculateBaseItemMatch(tmdbData, globalProfile, context);
            const finalScore = ((profileScore * ACTIVE_PROFILE_WEIGHT) + (globalScore * GLOBAL_PROFILE_WEIGHT)) * dnaMultiplier;
            return Math.min(Math.max(finalScore, 0), 10);
        }

        return Math.min(Math.max(profileScore * dnaMultiplier, 0), 10);
    }

    /**
     * Applica cap di diversità ai risultati per evitare che un singolo genere/regista domini.
     * @param {Array} items Array di oggetti con proprietà id, genres, directors
     * @param {Object} caps Limiti massimi per categoria { genre: 10, director: 3 }
     * @returns {Array} Array filtrato con diversità garantita
     */
    static applyDiversityCaps(items, caps = { genre: 10, director: 3 }) {
        if (!items || items.length === 0) return items;

        const genreCounts = new Map();
        const directorCounts = new Map();
        const result = [];

        for (const item of items) {
            const genres = item.genre_ids || (item.genres ? item.genres.map(g => g.id) : []);
            const directors = (item.credits?.crew || [])
                .filter(c => c.job === 'Director')
                .map(c => c.id);

            // Check genre cap
            const genreBlocked = genres.some(gid => (genreCounts.get(gid) || 0) >= caps.genre);
            // Check director cap
            const dirBlocked = directors.some(did => (directorCounts.get(did) || 0) >= caps.director);

            if (genreBlocked || dirBlocked) continue;

            genres.forEach(gid => genreCounts.set(gid, (genreCounts.get(gid) || 0) + 1));
            directors.forEach(did => directorCounts.set(did, (directorCounts.get(did) || 0) + 1));
            result.push(item);
        }

        return result;
    }
}

module.exports = ProfileScorer;
