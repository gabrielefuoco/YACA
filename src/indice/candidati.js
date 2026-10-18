/**
 * src/indice/candidati.js
 *
 * Fornitore di candidati spiegati per gusto (Ticket 41 - Prima fetta).
 *
 * Contratto unico: dato un contesto di profilo RISOLTO (src/profile/context.js),
 * restituisce candidati spiegati: { candidati: [ { id, motivo, punteggio } ], motivi: [ ... ] }.
 *
 * Invarianti e regole:
 * 1. "Le porte non sollevano mai": restituisce sempre una lista (anche vuota) e motivi[].
 * 2. Il contesto in ingresso è già RISOLTO: contiene selettoriEffettivi, kidsMode, sliders.
 *    Non re-risolve nulla e non aggiunge ripieghi su selettori grezzi (Decisione 21).
 * 3. Usa esclusivamente i moduli nuovi:
 *    - src/indice/ (compiler, duckDbStore) per l'accesso ai dati
 *    - src/profile/ProfileScorer per affinità VSM e diversità
 *    - src/library/semiDi per i semi di cronologia/libreria
 *    - src/anime per la politica anime e l'identità
 */

const compiler = require('./compiler');
const duckDbStore = require('./duckDbStore');
const { isItemAnime, ANIME_POLICY_MODES, isAnimeContent } = require('../anime');
const { F, S } = require('./filters');
const { isItemInappropriateForKids, ADULT_GENRE_IDS, ADULT_KEYWORD_IDS } = require('../catalog/kidsModeFilters');

const HIDDEN_GEMS_MAX_POPULARITY = 20;
const HIDDEN_GEMS_MIN_SCORE = 6.5;
const HIDDEN_GEMS_MIN_VOTES = 50;
const HIDDEN_GEMS_MAX_VOTES = 1000;

const BOX_SET_YEAR_RANGE_REGEX = /\b(19|20)\d{2}\s*[-–—]\s*(19|20)\d{2}\b/;
const BOX_SET_KEYWORD_REGEX = /\b(trilogy|trilogia|collection|collezione|anthology|antologia|complete)\b/i;

function isCompilationOrBoxSet(item) {
    if (!item) return false;
    const target = item.rawTMDB || item.data || item;
    const titles = [target.title, target.name, target.original_title, item.name, item.title].filter(Boolean);
    if (titles.some(t => BOX_SET_YEAR_RANGE_REGEX.test(t))) {
        return true;
    }
    const runtime = Number(target.runtime ?? item.runtime);
    if (Number.isFinite(runtime) && runtime >= 240) {
        if (titles.some(t => BOX_SET_KEYWORD_REGEX.test(t))) {
            return true;
        }
    }
    return false;
}

function isQualityFloorItemRecent(item, mediaType = 'movie') {
    if (!item) return false;
    const target = item.rawTMDB || item.data || item;
    const isTv = mediaType === 'tv' || mediaType === 'series';
    const dateStr = isTv
        ? (target.first_air_date || target.release_date || item.first_air_date || item.release_date)
        : (target.release_date || target.first_air_date || item.release_date || item.first_air_date);
    if (!dateStr || typeof dateStr !== 'string') return false;
    const timestamp = Date.parse(dateStr);
    if (isNaN(timestamp)) return false;
    const now = Date.now();
    if (timestamp > now + 30 * 24 * 60 * 60 * 1000) return false;
    const windowDays = isTv ? 180 : 60;
    return (now - timestamp) <= windowDays * 24 * 60 * 60 * 1000;
}

function passesQualityFloor(item, mediaType = 'movie', isHiddenGems = false) {
    if (!item) return false;
    const target = item.rawTMDB || item.data || item;
    const voteCount = typeof target.vote_count === 'number' ? target.vote_count : (typeof item.vote_count === 'number' ? item.vote_count : undefined);
    const voteAvg = typeof target.vote_average === 'number' ? target.vote_average : (typeof item.vote_average === 'number' ? item.vote_average : undefined);

    // If it's hidden gems, niche titles with lower vote count are allowed by design
    if (!isHiddenGems) {
        // Ticket 35: Discovery permissiva sui recenti:
        // Titoli recenti (<= 60gg film, <= 180gg serie) ammessi con pavimento a 50 voti
        // Il catalogo vecchio richiede invece invariato vote_count >= 300
        const isRecent = isQualityFloorItemRecent(item, mediaType);
        const minVotesRequired = isRecent ? 50 : 300;
        if (voteCount !== undefined && voteCount < minVotesRequired) return false;
        if (voteAvg !== undefined && voteAvg < 6.5) return false;
    }

    if (mediaType === 'movie') {
        if (isCompilationOrBoxSet(item)) return false;

        const runtime = Number(target.runtime ?? item.runtime);
        if (Number.isFinite(runtime) && runtime > 0 && runtime < 60) return false;

        const rawGenres = target.genre_ids || (target.genres ? target.genres.map(g => (typeof g === 'object' && g !== null ? (g.id ?? g) : g)) : []);
        const gids = rawGenres.map(Number);
        const kws = Array.isArray(target.keywords)
            ? target.keywords
            : (target.keywords?.results || target.keywords?.keywords || []);
        const title = target.title || target.name || item.name || '';
        const isSpecialOrEpisode = target.episode_number !== undefined
            || (gids.includes(10770) && kws.some(k => /tv episode|special/i.test(typeof k === 'object' ? k.name : k)))
            || /special|abominevole sposa/i.test(title);
        if (isSpecialOrEpisode) return false;
    }
    return true;
}

function parseRowData(row, isMovie) {
    let parsedGenres = [];
    try {
        parsedGenres = typeof row.genres === 'string' ? JSON.parse(row.genres) : (Array.isArray(row.genres) ? row.genres : []);
    } catch (_) {}

    let parsedKeywords = [];
    try {
        parsedKeywords = typeof row.keywords === 'string' ? JSON.parse(row.keywords) : (Array.isArray(row.keywords) ? row.keywords : []);
    } catch (_) {}

    const parsedCrew = [];
    try {
        if (row.directors) {
            const dirs = typeof row.directors === 'string' ? JSON.parse(row.directors) : row.directors;
            if (Array.isArray(dirs)) {
                parsedCrew.push(...dirs.map(d => ({ ...d, job: d.job || 'Director' })));
            }
        }
    } catch (_) {}
    try {
        if (row.writers) {
            const wrs = typeof row.writers === 'string' ? JSON.parse(row.writers) : row.writers;
            if (Array.isArray(wrs)) {
                parsedCrew.push(...wrs.map(w => ({ ...w, job: w.job || 'Writer' })));
            }
        }
    } catch (_) {}

    let parsedCast = [];
    try {
        if (row.cast) {
            parsedCast = typeof row.cast === 'string' ? JSON.parse(row.cast) : (Array.isArray(row.cast) ? row.cast : []);
        }
    } catch (_) {}

    const voteCount = Number(row.vote_count) || 0;
    const voteAverage = row.vote_average !== null && row.vote_average !== undefined ? Number(row.vote_average) : 0;
    const popularity = Number(row.popularity) || 0;
    const id = Number(row.id);

    const target = {
        id,
        _tmdbId: id,
        title: row.title || row.name || row.original_title || row.original_name || '',
        name: row.name || row.title || '',
        original_title: row.original_title || row.original_name,
        overview: row.overview || '',
        vote_average: voteAverage,
        vote_count: voteCount,
        popularity,
        runtime: row.runtime !== null && row.runtime !== undefined ? Number(row.runtime) : null,
        release_date: row.release_date,
        first_air_date: row.first_air_date,
        original_language: row.original_language,
        genres: parsedGenres,
        genre_ids: parsedGenres.map(g => (typeof g === 'object' && g !== null ? g.id : g)).filter(Boolean),
        credits: { cast: parsedCast, crew: parsedCrew },
        keywords: { results: parsedKeywords, keywords: parsedKeywords },
        media_type: isMovie ? 'movie' : 'tv'
    };

    return target;
}

/**
 * Fornisce una lista spiegata di candidati basati sul gusto.
 *
 * @param {Object} contesto Contesto profilo già RISOLTO (contestoDi)
 * @param {Object} [opzioni] Opzioni di recupero { mediaType, strategia, limit, db, queryCompiler }
 * @returns {Promise<{ candidati: Array<{ id: string, motivo: string, punteggio: number }>, motivi: Array<string>, items: Array<object> }>}
 */
async function candidati(contesto, opzioni = {}) {
    const motivi = [];

    try {
        let ctx = contesto;
        let opts = opzioni;
        if (contesto && contesto.contesto && typeof contesto.contesto === 'object') {
            ctx = contesto.contesto;
            opts = { ...contesto, ...opzioni };
        }

        if (!ctx || typeof ctx !== 'object') {
            return { candidati: [], items: [], motivi: ['contesto_mancante'] };
        }

        const rawMediaType = opts.mediaType || opts.medium || 'movie';
        const isMovie = rawMediaType === 'movie';
        const tipo = isMovie ? 'movie' : 'series';
        const contentTipo = isMovie ? 'movie' : 'tv';
        const strategia = opts.strategia || 'hidden_gems';
        const limit = Math.max(1, Math.min(Number(opts.limit) || 100, 500));
        const db = opts.db || duckDbStore;
        const qCompiler = opts.queryCompiler || compiler;

        const effectiveSelectors = ctx.selettoriEffettivi || {};
        const kidsMode = Boolean(ctx.kidsMode);
        const animePolicy = effectiveSelectors.anime || 'neutral';

        const { ProfileScorer } = require('../profile');

        // 1. Lettura Semi dalla Libreria (src/library/semiDi caricato dalla porta)
        const userSeeds = new Map();
        if (ctx.userId) {
            try {
                const { semiDi } = require('../library');
                const seedResult = await semiDi({
                    userId: ctx.userId,
                    profileId: ctx.profileId || 'global',
                    medium: tipo
                });
                if (seedResult?.seeds instanceof Map) {
                    for (const [sId, w] of seedResult.seeds.entries()) {
                        userSeeds.set(String(sId), w);
                    }
                }
            } catch (seedErr) {
                motivi.push(`semi_degradati: ${seedErr.message}`);
            }
        }

        // 2. Lettura del profilo di gusto (passato nel contesto dal chiamante)
        const tasteProfile = ctx.tasteProfile || ctx.profile || null;
        if (!tasteProfile) {
            motivi.push('taste_profile_non_disponibile');
        }
        if (ctx.isMongoConnected === false || ctx.databaseConnected === false || ctx.dbConnected === false) {
            motivi.push('database_profilo_non_connesso');
        }

        // 3. Costruzione filtri dichiarativi per DuckDB (compiler)
        const where = [];

        if (strategia === 'hidden_gems') {
            where.push(F.minScore(HIDDEN_GEMS_MIN_SCORE));
            where.push(F.minVotes(HIDDEN_GEMS_MIN_VOTES));
            where.push(F.maxVotes(HIDDEN_GEMS_MAX_VOTES));
            where.push(F.maxPopularity(HIDDEN_GEMS_MAX_POPULARITY));
            if (isMovie) {
                where.push(F.minRuntime(60));
            }
        }

        // Politica Anime (src/anime)
        if (animePolicy === ANIME_POLICY_MODES.ONLY) {
            where.push(F.animeOf(tipo));
        } else if (animePolicy === ANIME_POLICY_MODES.EXCLUDE) {
            where.push(`NOT (${F.animeOf(tipo)})`);
        }

        // Kids Mode (src/catalog/kidsModeFilters)
        if (kidsMode) {
            if (ADULT_GENRE_IDS) {
                where.push(F.notGenre(...ADULT_GENRE_IDS.split(',').map(Number)));
            }
            if (ADULT_KEYWORD_IDS) {
                where.push(F.notKeyword(...ADULT_KEYWORD_IDS.split(',').map(Number)));
            }
        }

        const candidatePoolSize = Math.max(limit * 3, 200);
        const preset = {
            type: tipo,
            where,
            orderBy: S.QUALITY
        };

        let rawRows = [];
        try {
            const compiled = await qCompiler.compileQuery(preset, 0, candidatePoolSize, db);
            rawRows = await db.query(compiled.sql, compiled.params);
            if (!Array.isArray(rawRows)) rawRows = [];
        } catch (dbErr) {
            motivi.push(`errore_indice: ${dbErr.message}`);
            return { candidati: [], items: [], motivi };
        }

        if (rawRows.length === 0) {
            motivi.push('nessun_candidato_grezzo');
            return { candidati: [], items: [], motivi };
        }

        // 4. Scoring VSM, spiegazione e filtraggio fine
        const scored = [];
        for (const row of rawRows) {
            const raw = parseRowData(row, isMovie);
            const cleanId = String(raw.id);

            if (kidsMode && ProfileScorer.isItemInappropriateForKids(raw)) continue;
            if (!passesQualityFloor(raw, tipo, strategia === 'hidden_gems')) continue;

            const isAnime = isItemAnime(raw, contentTipo);
            if (animePolicy === ANIME_POLICY_MODES.ONLY && !isAnime) continue;
            if (animePolicy === ANIME_POLICY_MODES.EXCLUDE && isAnime) continue;

            if (strategia === 'hidden_gems' && tasteProfile) {
                if (!ProfileScorer.isHiddenGemAlignedWithProfile(raw, tasteProfile, contentTipo)) continue;
            }

            const score = ProfileScorer.calculateItemMatch(raw, tasteProfile, {
                kidsMode,
                animePolicy,
                typeSelectors: effectiveSelectors
            });
            if (kidsMode && tasteProfile && score <= 0) continue;

            // Spiegazione del candidato
            let motivo = 'gemma_nascosta:qualita_bayesiana';
            if (userSeeds.has(cleanId)) {
                motivo = 'seme_cronologia';
            } else if (score >= 7.0) {
                motivo = 'gemma_nascosta:vsm_alta_affinita';
            } else if (score >= 4.0) {
                motivo = 'gemma_nascosta:vsm_buona_affinita';
            } else if (raw.vote_average >= 7.0) {
                motivo = 'gemma_nascosta:alto_rating';
            }

            scored.push({
                id: cleanId,
                tmdbId: Number(raw.id),
                motivo,
                punteggio: Number(score.toFixed(2)),
                score,
                rawScore: score,
                data: raw,
                genres: (raw.genres || []).map(g => (typeof g === 'object' && g !== null ? (g.name || g.id) : g)),
                genre_ids: raw.genre_ids || []
            });
        }

        if (scored.length === 0) {
            motivi.push('nessun_candidato_valido');
            return { candidati: [], items: [], motivi };
        }

        // 5. Ordinamento e quote di diversità (ProfileScorer)
        scored.sort((a, b) => b.score - a.score);

        const capped = ProfileScorer.applyDiversityCaps(scored, {
            genre: 10,
            director: 3,
            strand: 3,
            highMatchGenreCap: 10,
            family: kidsMode ? null : 2
        });

        const finalCandidates = capped.slice(0, limit).map(item => ({
            id: item.id,
            motivo: item.motivo,
            punteggio: item.punteggio,
            genres: item.genres,
            genre_ids: item.genre_ids
        }));

        return {
            candidati: finalCandidates,
            items: finalCandidates,
            motivi
        };
    } catch (unhandledErr) {
        return {
            candidati: [],
            items: [],
            motivi: [`errore_imprevisto_candidati: ${unhandledErr.message || 'sconosciuto'}`]
        };
    }
}

module.exports = {
    candidati,
    candidatiPerGusto: candidati,
    isCompilationOrBoxSet,
    passesQualityFloor,
    isQualityFloorItemRecent,
    HIDDEN_GEMS_MAX_POPULARITY,
    HIDDEN_GEMS_MIN_SCORE,
    HIDDEN_GEMS_MIN_VOTES,
    HIDDEN_GEMS_MAX_VOTES
};
