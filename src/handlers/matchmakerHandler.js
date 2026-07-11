const { matchmakerSessionCache } = require('../cache/cacheInstances');
const { nanoid } = require('nanoid');
const { Mistral } = require('@mistralai/mistralai');
const TasteProfile = require('../models/TasteProfile');
const UserAccount = require('../db/models/UserAccount');
const AddonConfig = require('../db/models/AddonConfig');
const { createTmdbClient } = require('../clients/tmdb');
const { executeUniversalPipeline } = require('../catalog/providers/AiDiscoveryProvider');
const { parseQuerySynthesizerResponse, buildDnaDescription } = require('../ai/querySynthesizer');
const ProfileScorer = require('../profile/ProfileScorer');

const MAX_ITERATIONS = 8;
const CARDS_PER_BATCH = 10;

// Prompt Mistral per il Matchmaker strutturato come querySynthesizer
const MATCHMAKER_SYSTEM_PROMPT = `You are the YACA Matchmaker AI, a cinematic sommelier. Current Year: ${new Date().getFullYear()}.

### DECISION LOGIC (FOLLOW STRICTLY):
1. STRATEGY: "matchmaker_refinement"
   - INPUT: User swipe history (liked/disliked titles with genres) + optional Taste DNA
   - OUTPUT: ARRAY of 2-3 "discovery" query objects
   - GOAL: Target vibes the user likes. Avoid vibes tied to dislikes.

### PARAMETER EXTRACTION RULES:
- KEYWORDS: descriptive English nouns. Do NOT use numerical IDs.
- GENRES: Map to TMDB numerical IDs (Action → 28, Adventure → 12, Animation → 16, Comedy → 35, Crime → 80, Documentary → 99, Drama → 18, Family → 10751, Fantasy → 14, History → 36, Horror → 27, Music → 10402, Mystery → 9648, Romance → 10749, Sci-Fi → 878, TV Movie → 10770, Thriller → 53, War → 10752, Western → 37)
- LOGIC OPERATORS: pipe (|) = OR, comma (,) = AND. Prefer pipe for broad discovery.

### EXAMPLES (FEW-SHOT):
User liked: "Inception" (Sci-Fi, Action), "Interstellar" (Drama, Sci-Fi)
User disliked: "The Notebook" (Romance, Drama)
→ Output:
[
  { "vibe": "Mind-bending Sci-Fi", "genre_ids": [878, 28], "keyword": "dream|simulation|time travel" },
  { "vibe": "Epic Space Drama", "genre_ids": [878, 18], "keyword": "space|astronaut" }
]

### RESPONSE FORMAT (JSON ARRAY ONLY):
[{ "vibe": "string", "genre_ids": [int] | null, "keyword": "string" | null }]`;


/**
 * Helper per tradurre array di ID genere nei nomi (per il prompt)
 */
function genreIdsToNames(ids) {
    if (!Array.isArray(ids)) return '';
    const map = {
        28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 99: 'Documentary',
        18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music',
        9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi', 10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western'
    };
    return ids.map(id => map[id] || id).join(', ');
}

/**
 * [DNA LAYER - OPZIONALE] 
 * Costruisce la descrizione del DNA utente per arricchire il prompt Mistral.
 */
async function getMatchmakerDnaContext(userId, profileId) {
    try {
        const profile = await TasteProfile.findOne({ userId, context: profileId }).lean();
        const user = await UserAccount.findOne({ userId }).lean();
        
        if (!profile && !user) return null;
        return buildDnaDescription(profile, user, profileId);
    } catch (err) {
        console.warn('[Matchmaker] DNA context unavailable:', err.message);
        return null; // Graceful degradation
    }
}

/**
 * [DNA LAYER - OPZIONALE]
 * Carica il TasteProfile dell'utente e ordina gli item per affinità usando calculateLightScore.
 */
async function sortByDnaAffinity(items, userId, profileId) {
    try {
        if (!items || items.length === 0) return items;
        const profile = await TasteProfile.findOne({ userId, context: profileId }).lean();
        if (!profile?.compiledVectors?.V_final) return items; // No DNA → keep original order
        
        return [...items].sort((a, b) => {
            const scoreB = ProfileScorer.calculateLightScore(b, profile);
            const scoreA = ProfileScorer.calculateLightScore(a, profile);
            return scoreB - scoreA;
        });
    } catch (err) {
        console.warn('[Matchmaker] DNA sort unavailable:', err.message);
        return items; // Graceful degradation
    }
}

/**
 * Helper con exponential backoff per Rate Limits (429) di Mistral.
 */
async function callMistralWithRetry(client, messages, maxRetries = 3) {
    let delay = 1000;
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await client.chat.complete({
                model: 'mistral-small-latest',
                messages: messages,
                response_format: { type: 'json_object' }
            });
        } catch (err) {
            if (err.statusCode === 429 && i < maxRetries - 1) {
                console.warn(`[Matchmaker] Rate limit 429, retrying in ${delay}ms... (Attempt ${i + 1} of ${maxRetries - 1})`);
                await new Promise(res => setTimeout(res, delay));
                delay *= 2;
            } else {
                throw err;
            }
        }
    }
}

/**
 * Inizializza una sessione di Matchmaker.
 */
async function initMatchmakerSession(req, res) {
    const { id: profileId } = req.params;
    const { userId, type = 'movie', vibeOrRandom = 'random' } = req.body;

    if (!userId) return res.status(400).json({ error: 'userId required' });

    try {
        const sessionId = `match_${nanoid(10)}`;
        
        // Logica Anime
        let tmdbType = type;
        let animeOverrides = {};
        if (type === 'anime') {
            tmdbType = 'series';
            animeOverrides = {
                with_genres: ['16'],
                with_keywords: 'anime',
                with_original_language: 'ja'
            };
        }

        // Inizializza stato sessione
        const sessionState = {
            userId, profileId,
            type: tmdbType,
            originalType: type,
            iteration: 0,
            likedIds: [], dislikedIds: [], watchlistIds: [],
            cardHistory: [],
            animeOverrides
        };

        const account = await UserAccount.findOne({ userId }).lean();
        const activeMistralKey = account?.apiKeys?.mistral || process.env.MISTRAL_API_KEY;
        const tmdbApiKey = account?.apiKeys?.tmdb || process.env.TMDB_API_KEY;

        let parsedQueries = [];
        const dnaContext = await getMatchmakerDnaContext(userId, profileId);

        if (activeMistralKey) {
            const client = new Mistral({ apiKey: activeMistralKey });
            
            let userPrompt = '';
            if (vibeOrRandom !== 'random') {
                userPrompt = `User vibe request: "${vibeOrRandom}". Generate discovery queries.`;
                if (dnaContext) userPrompt += `\n\nUser's Taste DNA for context:\n${dnaContext}`;
            } else {
                userPrompt = dnaContext 
                    ? `User's Taste DNA:\n${dnaContext}\n\nGenerate diverse initial discovery queries for ${tmdbType} content based on this DNA.`
                    : `Generate diverse initial discovery queries for ${tmdbType} content.`;
            }

            try {
                const response = await callMistralWithRetry(client, [
                    { role: 'system', content: MATCHMAKER_SYSTEM_PROMPT },
                    { role: 'user', content: userPrompt }
                ]);
                parsedQueries = parseQuerySynthesizerResponse(response.choices?.[0]?.message?.content);
            } catch (err) {
                console.error('[Matchmaker] Init Mistral error:', err);
            }
        }
        
        // Fallback queries in case Mistral fails or is disabled
        if (parsedQueries.length === 0) {
            parsedQueries = [{ vibe: 'Popular', genre_ids: null, keyword: null }];
        }

        console.log(`[Matchmaker] Init session ${sessionId}, user ${userId}, type: ${type}, mode: ${vibeOrRandom}`);
        console.log(`[Matchmaker] DNA: "${dnaContext || 'none'}"`);
        console.log(`[Matchmaker] Mistral response (${parsedQueries.length} queries):`, JSON.stringify(parsedQueries));

        // Costruisci catalogo universale
        const universalCatalog = {
            queries: parsedQueries.map(q => {
                let query = { strategy: 'discovery' };
                if (q.genre_ids) query.with_genres = q.genre_ids;
                if (q.keyword) query.with_keywords = q.keyword;
                
                // Merge overrides anime se presenti
                if (sessionState.animeOverrides.with_genres) {
                    query.with_genres = query.with_genres 
                        ? [...new Set([...query.with_genres, ...sessionState.animeOverrides.with_genres])]
                        : sessionState.animeOverrides.with_genres;
                }
                if (sessionState.animeOverrides.with_keywords) {
                    query.with_keywords = query.with_keywords 
                        ? `${query.with_keywords}|${sessionState.animeOverrides.with_keywords}`
                        : sessionState.animeOverrides.with_keywords;
                }
                if (sessionState.animeOverrides.with_original_language) {
                    query.with_original_language = sessionState.animeOverrides.with_original_language;
                }
                return query;
            }),
            presentation_strategy: 'interleave'
        };

        await matchmakerSessionCache.set(sessionId, sessionState);

        // Fetch via UniversalPipeline
        const tmdbClient = createTmdbClient(tmdbApiKey);
        const rawItems = await executeUniversalPipeline(universalCatalog, tmdbClient, tmdbApiKey, tmdbType, 0, { noFallback: false }, {});
        console.log(`[Matchmaker] Pipeline returned ${rawItems?.length || 0} items`);

        // Ordina per DNA affinità
        const sortedItems = await sortByDnaAffinity(rawItems || [], userId, profileId);
        
        // Return CARDS_PER_BATCH
        const cards = sortedItems.slice(0, CARDS_PER_BATCH).map(c => ({
            id: String(c.id).replace('tmdb:', ''),
            title: c.name,
            poster: c.poster,
            year: c.releaseInfo,
            overview: c.description,
            genre_ids: c.genre_ids,
            type: tmdbType
        }));
        
        console.log(`[Matchmaker] After DNA sort + dedup: ${cards.length} cards sent`);

        res.json({
            success: true,
            sessionId,
            iteration: 0,
            maxIterations: MAX_ITERATIONS,
            cards
        });

    } catch (error) {
        console.error('[Matchmaker] Error init:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

/**
 * Analizza gli swipe recenti e ritorna un nuovo batch di carte.
 */
async function analyzeMatchmakerSession(req, res) {
    const { id: profileId } = req.params;
    const { userId, sessionId, swipes } = req.body;
    // swipes: [{ id, action, title, genre_ids }]

    if (!userId || !sessionId) return res.status(400).json({ error: 'userId and sessionId required' });

    try {
        const sessionStateData = await matchmakerSessionCache.getWithStatus(sessionId);
        const sessionState = sessionStateData?.value;
        if (!sessionState) return res.status(404).json({ error: 'Session expired or not found' });

        // Update local session arrays & history
        (swipes || []).forEach(s => {
            sessionState.cardHistory.push({ id: s.id, title: s.title, genre_ids: s.genre_ids, action: s.action });
            if (s.action === 'like') sessionState.likedIds.push(s.id);
            if (s.action === 'dislike') sessionState.dislikedIds.push(s.id);
            if (s.action === 'watchlist') sessionState.watchlistIds.push(s.id);
        });

        sessionState.iteration += 1;

        if (sessionState.iteration >= MAX_ITERATIONS) {
            await matchmakerSessionCache.set(sessionId, sessionState);
            return res.json({
                success: true,
                endOfGame: true,
                message: 'Max iterations reached'
            });
        }

        const account = await UserAccount.findOne({ userId }).lean();
        const activeMistralKey = account?.apiKeys?.mistral || process.env.MISTRAL_API_KEY;
        const tmdbApiKey = account?.apiKeys?.tmdb || process.env.TMDB_API_KEY;
        let parsedQueries = [];

        if (activeMistralKey && swipes && swipes.length > 0) {
            const client = new Mistral({ apiKey: activeMistralKey });
            
            const likedTitles = sessionState.cardHistory
                .filter(c => c.action === 'like' || c.action === 'watchlist')
                .map(c => `"${c.title}" (${genreIdsToNames(c.genre_ids)})`)
                .join(', ');

            const dislikedTitles = sessionState.cardHistory
                .filter(c => c.action === 'dislike')
                .map(c => `"${c.title}" (${genreIdsToNames(c.genre_ids)})`)
                .join(', ');
                
            const prompt = `The user liked: ${likedTitles || 'nothing yet'}. The user disliked: ${dislikedTitles || 'nothing yet'}. Generate 2-3 discovery queries to find better matches.`;
            
            try {
                const response = await callMistralWithRetry(client, [
                    { role: 'system', content: MATCHMAKER_SYSTEM_PROMPT },
                    { role: 'user', content: prompt }
                ]);
                parsedQueries = parseQuerySynthesizerResponse(response.choices?.[0]?.message?.content);
                console.log(`[Matchmaker] Mistral output iterazione ${sessionState.iteration}:`, JSON.stringify(parsedQueries));
            } catch (err) {
                console.error('[Matchmaker] Analyze Mistral error:', err);
            }
        }

        if (parsedQueries.length === 0) {
            parsedQueries = [{ vibe: 'Popular Continuation', genre_ids: null, keyword: null }];
        }
        
        await matchmakerSessionCache.set(sessionId, sessionState);

        const universalCatalog = {
            queries: parsedQueries.map(q => {
                let query = { strategy: 'discovery' };
                if (q.genre_ids) query.with_genres = q.genre_ids;
                if (q.keyword) query.with_keywords = q.keyword;
                
                // Merge overrides anime
                if (sessionState.animeOverrides?.with_genres) {
                    query.with_genres = query.with_genres 
                        ? [...new Set([...query.with_genres, ...sessionState.animeOverrides.with_genres])]
                        : sessionState.animeOverrides.with_genres;
                }
                if (sessionState.animeOverrides?.with_keywords) {
                    query.with_keywords = query.with_keywords 
                        ? `${query.with_keywords}|${sessionState.animeOverrides.with_keywords}`
                        : sessionState.animeOverrides.with_keywords;
                }
                if (sessionState.animeOverrides?.with_original_language) {
                    query.with_original_language = sessionState.animeOverrides.with_original_language;
                }
                return query;
            }),
            presentation_strategy: 'interleave'
        };

        const tmdbClient = createTmdbClient(tmdbApiKey);
        
        // Paginazione: incrementiamo lo skip in base all'iterazione
        const skip = sessionState.iteration * CARDS_PER_BATCH;
        const rawItems = await executeUniversalPipeline(universalCatalog, tmdbClient, tmdbApiKey, sessionState.type, skip, { noFallback: false }, {});
        
        // Ordina per DNA
        const sortedItems = await sortByDnaAffinity(rawItems || [], userId, profileId);
        
        // Evitiamo dupes
        const seenIds = new Set([...sessionState.likedIds, ...sessionState.dislikedIds, ...sessionState.watchlistIds]);
        
        const cards = sortedItems
            .map(c => ({ ...c, rawId: String(c.id).replace('tmdb:', '') }))
            .filter(c => !seenIds.has(c.rawId))
            .slice(0, CARDS_PER_BATCH).map(c => ({
                id: c.rawId,
                title: c.name,
                poster: c.poster,
                year: c.releaseInfo,
                overview: c.description,
                genre_ids: c.genre_ids,
                type: sessionState.type
            }));

        res.json({
            success: true,
            iteration: sessionState.iteration,
            maxIterations: MAX_ITERATIONS,
            cards
        });

    } catch (error) {
        console.error('[Matchmaker] Error analyze:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

/**
 * Termina la sessione e salva il catalogo nel profilo utente globale
 */
async function finishMatchmakerSession(req, res) {
    const { id: profileId } = req.params;
    const { userId, sessionId, pendingSwipes } = req.body;

    if (!userId || !sessionId) return res.status(400).json({ error: 'userId and sessionId required' });

    try {
        const sessionStateData = await matchmakerSessionCache.getWithStatus(sessionId);
        const sessionState = sessionStateData?.value;
        if (!sessionState) return res.status(404).json({ error: 'Session expired or not found' });

        (pendingSwipes || []).forEach(s => {
            sessionState.cardHistory.push({ id: s.id, title: s.title, genre_ids: s.genre_ids, action: s.action });
            if (s.action === 'like') sessionState.likedIds.push(s.id);
            if (s.action === 'dislike') sessionState.dislikedIds.push(s.id);
            if (s.action === 'watchlist') sessionState.watchlistIds.push(s.id);
        });

        // Genera il Custom Catalog
        const winningIds = Array.from(new Set([...sessionState.likedIds, ...sessionState.watchlistIds]));
        let savedCatalog = null;
        
        if (winningIds.length > 0) {
            const catalogId = `custom_matchmaker_${nanoid(8)}`;
            const newCatalog = {
                id: catalogId,
                name: `Matchmaker (${new Date().toLocaleDateString()})`,
                type: sessionState.type,
                source: 'custom',
                emoji: '💖',
                presentation_strategy: 'popularity',
                queries: winningIds.map(id => ({
                    strategy: 'manual_list',
                    params: { with_id: id }
                }))
            };

            const account = await UserAccount.findOne({ userId }).lean();
            if (account?.addonUuid) {
                await AddonConfig.updateOne(
                    { uuid: account.addonUuid },
                    { $push: { customCatalogs: newCatalog } }
                );
                
                savedCatalog = {
                    id: catalogId,
                    name: newCatalog.name,
                    itemCount: winningIds.length,
                    type: sessionState.originalType || sessionState.type // 'anime' se applicabile
                };
            }
        }

        // Pulisce cache
        await matchmakerSessionCache.set(sessionId, null);

        res.json({ 
            success: true,
            catalog: savedCatalog
        });
    } catch (error) {
        console.error('[Matchmaker] Error finish:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

module.exports = {
    initMatchmakerSession,
    analyzeMatchmakerSession,
    finishMatchmakerSession
};
