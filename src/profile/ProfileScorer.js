// Bayesian Weighted Rating parameters (Phase 1.3)
const { BAYESIAN_MIN_VOTES, BAYESIAN_MEAN_VOTE } = require('../config');
const ACTIVE_PROFILE_WEIGHT = 0.8;
const GLOBAL_PROFILE_WEIGHT = 0.2;
const NICHE_GENRE_IDS = new Set(['99', '10402', '36', '37', '10770']);
const NICHE_MIN_REAL_VOTES = 20;
const NICHE_TARGET_MAX_VOTES = 500;
const NICHE_FADE_OUT_VOTES = 2000;
const NICHE_MIN_VOTE_BONUS = 1.0;
const NICHE_MAX_VOTE_BONUS = 2.5;

const { isItemInappropriateForKids } = require('../utils/kidsModeFilters');
const { G } = require('../data/filters');
const { isRetiredTmdbKeywordId, filterRetiredTmdbKeywords, sanitizeDnaVector } = require('../data/keywordIds');

function clampScore(value) {
    return Math.min(Math.max(value, 0), 10);
}

function getKeywordItems(data) {
    if (Array.isArray(data?.keywords)) return data.keywords;
    if (Array.isArray(data?.keywords?.results) && data.keywords.results.length > 0) {
        return data.keywords.results;
    }
    return data?.keywords?.keywords || [];
}

class ProfileScorer {
    static isItemInappropriateForKids(tmdbData) {
        return isItemInappropriateForKids(tmdbData);
    }
    static normalizeDnaId(value) {
        return String(value ?? '').replace(/^tmdb:/i, '').trim();
    }

    /**
     * Helper condiviso per recuperare tutti gli ID genere equivalenti (cross-mapping TV ↔ Film).
     * @param {string|number} id 
     * @returns {number[]}
     */
    static getEquivalentGenreIds(id) {
        if (typeof G?.getEquivalentGenreIds === 'function') {
            return G.getEquivalentGenreIds(id);
        }
        const num = Number(this.normalizeDnaId(id));
        if (isNaN(num)) return [];
        const alts = [];
        if (G._tvToMovie && G._tvToMovie[num]) {
            const m = G._tvToMovie[num];
            if (Array.isArray(m)) alts.push(...m);
            else alts.push(m);
        }
        if (G._movieToTv && G._movieToTv[num]) {
            const t = G._movieToTv[num];
            if (Array.isArray(t)) alts.push(...t);
            else alts.push(t);
        }
        return alts;
    }

    /**
     * Gets a score from the fused vector for a specific type and id.
     * @param {Object} vector V_final object
     * @param {'g'|'k'|'d'|'a'} prefix 
     * @param {string|number} id 
     * @returns {number}
     */
    static getVectorScore(vector, prefix, id) {
        if (!vector) return 0;
        const normId = this.normalizeDnaId(id);
        if (prefix === 'k' && isRetiredTmdbKeywordId(normId)) return 0;
        const direct = vector[`${prefix}:${normId}`];
        if (direct !== undefined) return direct;
        if (prefix === 'g') {
            const altIds = this.getEquivalentGenreIds(normId);
            let maxScore = 0;
            for (const altId of altIds) {
                const alt = vector[`g:${altId}`];
                if (alt !== undefined && alt > maxScore) {
                    maxScore = alt;
                }
            }
            if (maxScore > 0) return maxScore;
        }
        return 0;
    }

    static computeDnaMultiplier(tmdbData, dnaFilters = []) {
        if (!Array.isArray(dnaFilters) || dnaFilters.length === 0) return 1.0;

        const rawGenreIds = tmdbData.genre_ids || (tmdbData.genres ? tmdbData.genres.map(g => g.id) : []);
        const genreIdSet = new Set();
        for (const gid of rawGenreIds) {
            const norm = this.normalizeDnaId(gid);
            if (norm) {
                genreIdSet.add(norm);
                const alts = this.getEquivalentGenreIds(norm);
                alts.forEach(alt => genreIdSet.add(String(alt)));
            }
        }

        const keywordItems = filterRetiredTmdbKeywords(
            Array.isArray(tmdbData.keywords)
                ? tmdbData.keywords
                : (tmdbData.keywords?.keywords || tmdbData.keywords?.results || [])
        );
        const keywordIds = keywordItems.map((k) => this.normalizeDnaId(typeof k === 'object' && k !== null ? (k.id || k.name) : k));

        const hasGenreMatch = dnaFilters.some(
            (f) => f.type === 'genre' && genreIdSet.has(this.normalizeDnaId(f.id))
        );
        const hasKeywordMatch = dnaFilters.some(
            (f) => f.type === 'keyword' && !isRetiredTmdbKeywordId(f.id) && keywordIds.includes(this.normalizeDnaId(f.id))
        );

        return hasGenreMatch || hasKeywordMatch ? 1.0 : 0.1;
    }

    static calculateBaseItemMatch(tmdbData, profile, context = {}) {
        if (!tmdbData || !profile) return 0;
        const kidsMode = context.kidsMode ?? profile?.settings?.kidsMode ?? false;
        if (kidsMode && this.isItemInappropriateForKids(tmdbData)) return -9999;

        const tmdbWeight = context.tmdbWeight ?? profile.tmdbWeight ?? 1.0;
        const traktWeight = context.traktWeight ?? profile.traktWeight ?? 1.0;

        const vFinal = sanitizeDnaVector(profile.compiledVectors?.V_final || {});
        let thematicScore = 0;
        let authorialScore = 0;

        // --- 1. Assi Tematici (VSM: Vector Space Model) ---
        // Generi
        const genreIds = tmdbData.genre_ids || (tmdbData.genres ? tmdbData.genres.map(g => g.id) : []);
        let unalignedGenres = 0;
        genreIds.forEach(gid => {
            if (gid !== undefined && gid !== null) {
                const affinity = this.getVectorScore(vFinal, 'g', gid);
                thematicScore += affinity;
                if (affinity < 0.05) unalignedGenres++;
            }
        });

        // Keywords (VSM Gerarchico: L1, L2, L3)
        const keywordItems = filterRetiredTmdbKeywords(getKeywordItems(tmdbData));
        const HierarchicalGraph = require('../engines/graph/HierarchicalGraph');
        const hVector = HierarchicalGraph.vectorizeKeywords(keywordItems);
        
        for (const [nodeKey, movieNodeWeight] of Object.entries(hVector)) {
            const userAffinity = vFinal[nodeKey];
            if (userAffinity) {
                thematicScore += (userAffinity * movieNodeWeight);
            }
        }
        
        // --- 1.1 Curva Logaritmica del Thematic Score (Soft-cap) ---
        // Calcolato subito per poterlo usare nel filtro alieno (inclusivo dei topoi)
        const scaledThematicScore = 10.0 * (1 - Math.exp(-thematicScore / 25.0));

        // --- 1.2 Calcolo penalità per disallineamento di genere (Alien Ratio) ---
        let genreAlignmentMultiplier = 1.0;
        const hasProfileGenres = Object.keys(vFinal).some(k => k.startsWith('g:'));
        if (hasProfileGenres && genreIds.length > 0) {
            let effectiveAlienRatio = unalignedGenres / genreIds.length;
            
            // Perdono basato sul Thematic Score: se il film risuona fortemente con il DNA 
            // (grazie alle keyword e ai topoi), riduciamo la penalità dei generi alieni.
            if (scaledThematicScore >= 7.0) {
                effectiveAlienRatio *= 0.1; // Match fortissimo: perdona quasi tutto
            } else if (scaledThematicScore >= 5.0) {
                effectiveAlienRatio *= 0.4; // Match alto: perdona parzialmente
            } else if (scaledThematicScore >= 3.0) {
                effectiveAlienRatio *= 0.7; // Match moderato: perdono leggero
            }

            if (effectiveAlienRatio >= 0.5) {
                genreAlignmentMultiplier = 0.3; // 50%+ dei generi sono alieni al DNA: penalità severa
            } else if (effectiveAlienRatio >= 0.3) {
                genreAlignmentMultiplier = 0.6; // 30%+ dei generi sono alieni: penalità moderata
            }
        }

        // --- 2. Assi Autoriali (Precision Bonus) ---
        // Registi
        if (tmdbData.credits && tmdbData.credits.crew) {
            const directors = tmdbData.credits.crew.filter(c => c.job === 'Director');
            directors.forEach(d => {
                if (d && d.id) {
                    authorialScore += this.getVectorScore(vFinal, 'd', d.id);
                }
            });
        }

        // Attori
        if (tmdbData.credits && tmdbData.credits.cast) {
            tmdbData.credits.cast.slice(0, 5).forEach(a => {
                if (a && a.id) {
                    authorialScore += this.getVectorScore(vFinal, 'a', a.id);
                }
            });
        }

        // --- 3. Final Affinity Weighting (Thematic 98%, Authorial 2%) ---
        // Authorial weight is minimized as per user feedback: "non sono così importanti"
        const hasProfileSignal = vFinal && Object.keys(vFinal).length > 0;
        const profileMatch = hasProfileSignal
            ? (scaledThematicScore * 0.98) + (authorialScore * 0.02)
            : null;

        // --- Phase 1.3: Bayesian Weighted Rating (IMDb formula) ---
        // WR = ((v/(v+m)) * R) + ((m/(v+m)) * C)
        const voteAvg = tmdbData.vote_average || 0;
        const voteCount = tmdbData.vote_count || 0;
        const m = BAYESIAN_MIN_VOTES;
        const C = BAYESIAN_MEAN_VOTE;
        const bayesianScore = ((voteCount / (voteCount + m)) * voteAvg) + ((m / (voteCount + m)) * C);

        // --- 4. Formula Finale: Mitigazione Blockbuster e Decadimento Dinamico ---
        // 4.1 Decadimento Dinamico del Voto: più il match VSM è alto, meno conta la massa
        // Calcoliamo un fattore di decadimento (es. se profileMatch è 8.0, decayFactor = 1 - 0.8 = 0.2)
        // Usiamo un tetto massimo di decadimento per non azzerarlo completamente (min 0.1)
        const isMatchNull = profileMatch === null;
        const matchRatio = !isMatchNull ? Math.min(profileMatch / 10.0, 0.9) : 0; 
        const dynamicTmdbWeight = tmdbWeight * (1 - matchRatio);
        
        // BUG-DNA-4: Rinormalizzazione sui segnali disponibili per evitare che nei profili freddi
        // (con match nullo / assenza di segnale profilo) traktWeight agisca da peso morto dividendo per 2.0
        // e dimezzando ingiustificatamente il punteggio bayesiano di qualità.
        const effectiveTraktWeight = !isMatchNull ? traktWeight : 0;
        const totalDynamicWeight = dynamicTmdbWeight + effectiveTraktWeight;
        let finalScore = 0;
        
        if (isMatchNull) {
            finalScore = bayesianScore;
        } else if (totalDynamicWeight > 0) {
            finalScore = ((profileMatch * effectiveTraktWeight) + (bayesianScore * dynamicTmdbWeight)) / totalDynamicWeight;
        }

        // 4.2 Hidden Gem Boost (Moltiplicatore Coda Lunga)
        // Se un film è poco popolare (sotto i 1000 voti) ma ha un buon match (es. >= 4.0), applichiamo un bonus.
        if (voteCount < 1000 && !isMatchNull && profileMatch >= 4.0) {
            // Bonus proporzionale alla "mancanza" di voti (max +25% di bonus)
            const indieBonus = 1.0 + (0.25 * (1 - (voteCount / 1000)));
            finalScore *= indieBonus;
        }
        
        // 4.3 Applica Penalità di Genere Finale (Evita che il Bayesian Rating salvi film fuori target)
        finalScore *= genreAlignmentMultiplier;

        const finalClamped = clampScore(finalScore);
        return finalClamped;
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
     * Tier 1 Light Score: calcola un punteggio usando solo generi e formula bayesiana dei voti.
     * Eseguibile in RAM senza chiamate API aggiuntive, usato per il taglio brutale del Two-Tier Scoring.
     * @param {Object} lightData Dati leggeri { id, genre_ids, vote_average, vote_count }
     * @param {Object} profile Documento TasteProfile
     * @returns {Number} Score da 0.0 a 10.0
     */
    static calculateNicheVoteBonus(voteCount) {
        // Hidden gems should reward "real but niche" titles: ignore near-empty vote counts,
        // favor the 20-500 vote window, then fade out the bonus as titles become mainstream.
        if (voteCount < NICHE_MIN_REAL_VOTES) return 0;
        if (voteCount <= NICHE_TARGET_MAX_VOTES) {
            const voteDensityRatio = (NICHE_TARGET_MAX_VOTES - voteCount)
                / (NICHE_TARGET_MAX_VOTES - NICHE_MIN_REAL_VOTES);
            return NICHE_MIN_VOTE_BONUS + (voteDensityRatio * (NICHE_MAX_VOTE_BONUS - NICHE_MIN_VOTE_BONUS));
        }
        if (voteCount <= NICHE_FADE_OUT_VOTES) {
            const mainstreamFadeRatio = (voteCount - NICHE_TARGET_MAX_VOTES)
                / (NICHE_FADE_OUT_VOTES - NICHE_TARGET_MAX_VOTES);
            return Math.max(0, NICHE_MIN_VOTE_BONUS - mainstreamFadeRatio);
        }
        return 0;
    }

    static calculateLightScore(lightData, profile, context = {}) {
        if (!lightData || !profile) return 0;
        const kidsMode = context.kidsMode ?? profile?.settings?.kidsMode ?? false;
        if (kidsMode && this.isItemInappropriateForKids(lightData)) return -9999;

        // Genre match score
        const vFinal = sanitizeDnaVector(profile.compiledVectors?.V_final || {});
        let genreScore = 0;
        let unalignedGenres = 0;
        const genreIds = lightData.genre_ids || [];
        genreIds.forEach(gid => {
            if (gid !== undefined && gid !== null) {
                const affinity = this.getVectorScore(vFinal, 'g', gid);
                genreScore += affinity;
                if (affinity < 0.05) unalignedGenres++;
            }
        });

        // Keywords (VSM Gerarchico: L1, L2, L3)
        const keywordItems = filterRetiredTmdbKeywords(getKeywordItems(lightData));
        let keywordScore = 0;
        const HierarchicalGraph = require('../engines/graph/HierarchicalGraph');
        const hVector = HierarchicalGraph.vectorizeKeywords(keywordItems);
        
        for (const [nodeKey, movieNodeWeight] of Object.entries(hVector)) {
            const userAffinity = vFinal[nodeKey];
            if (userAffinity) {
                keywordScore += (userAffinity * movieNodeWeight);
            }
        }

        const nicheGenreBonus = genreIds.reduce((bonus, gid) => (
            NICHE_GENRE_IDS.has(gid?.toString()) ? bonus + 0.75 : bonus
        ), 0);
        
        let genreAlignmentMultiplier = 1.0;
        if (genreIds.length > 0) {
            const alienRatio = unalignedGenres / genreIds.length;
            if (alienRatio >= 0.5) {
                genreAlignmentMultiplier = 0.3;
            } else if (alienRatio >= 0.3) {
                genreAlignmentMultiplier = 0.6;
            }
        }

        // Bayesian Weighted Rating
        const voteAvg = lightData.vote_average || 0;
        const voteCount = lightData.vote_count || 0;
        const m = BAYESIAN_MIN_VOTES;
        const C = BAYESIAN_MEAN_VOTE;
        const bayesianScore = ((voteCount / (voteCount + m)) * voteAvg) + ((m / (voteCount + m)) * C);

        if (context.catalogContext === 'hidden_gems' || context.catalogContext === 'niche') {
            const credibilityMultiplier = (voteCount > 0 && voteCount < NICHE_MIN_REAL_VOTES) ? 0.15 : 1;
            const nicheVoteBonus = this.calculateNicheVoteBonus(voteCount);
            const thematicScore = genreScore + (keywordScore * 0.35) + nicheGenreBonus;
            const combined = (((thematicScore * 0.8) + (nicheVoteBonus * 0.2)) * credibilityMultiplier) * genreAlignmentMultiplier;
            return clampScore(combined);
        }

        // Combine: genre affinity (70%) + bayesian quality (30%)
        const combined = ((genreScore * 0.7) + (bayesianScore * 0.3)) * genreAlignmentMultiplier;
        return clampScore(combined);
    }

    /**
     * Applica cap di diversità ai risultati per evitare che un singolo genere/regista domini.
     * @param {Array} items Array di oggetti con proprietà id, genres, directors
     * @param {Object} caps Limiti massimi per categoria { genre: 10, director: 3 }
     * @returns {Array} Array filtrato con diversità garantita
     */
    static applyDiversityCaps(items, caps = { genre: 10, director: 3 }) {
        if (!items || items.length === 0) return items;

        const genreCap = caps?.genre ?? 10;
        const directorCap = caps?.director ?? 3;
        const genreCounts = new Map();
        const directorCounts = new Map();
        const result = [];

        for (const item of items) {
            const target = item.data || item.rawTMDB || item;
            const genres = (target.genre_ids || (target.genres ? target.genres.map(g => (typeof g === 'object' && g !== null ? (g.id ?? g) : g)) : [])).map(g => (g !== null && g !== undefined ? String(g) : g));
            const directorCredits = target.credits?.crew || target.rawTMDB?.credits?.crew || [];
            const directors = directorCredits
                .filter(c => c.job === 'Director')
                .map(c => String(c.id));

            // Check genre cap
            const genreBlocked = genres.some(gid => (genreCounts.get(gid) || 0) >= genreCap);
            // Check director cap
            const dirBlocked = directors.some(did => (directorCounts.get(did) || 0) >= directorCap);

            if (genreBlocked || dirBlocked) continue;

            genres.forEach(gid => genreCounts.set(gid, (genreCounts.get(gid) || 0) + 1));
            directors.forEach(did => directorCounts.set(did, (directorCounts.get(did) || 0) + 1));
            result.push(item);
        }

        return result;
    }
}

module.exports = ProfileScorer;
