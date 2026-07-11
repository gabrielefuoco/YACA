const { matchmakerSessionCache } = require('../cache/cacheInstances');
const { nanoid } = require('nanoid');
const { Mistral } = require('@mistralai/mistralai');
const TasteProfile = require('../models/TasteProfile');
const UserAccount = require('../db/models/UserAccount');
const AddonConfig = require('../db/models/AddonConfig');
const { createTmdbClient, fetchTmdbCatalogDirect } = require('../clients/tmdb');
const { safeJsonParse } = require('../utils/jsonParser');

const MAX_ITERATIONS = 8;
const BATCH_SIZE = 8; // Numero di swipe dopo i quali si triggera l'analyze
const CARDS_PER_BATCH = 10; // Quanti film ritorna Mistral/TMDB ogni giro

// Prompt Mistral per il Matchmaker
const MATCHMAKER_SYSTEM_PROMPT = `You are the YACA Matchmaker AI, a cinematic sommelier. Current Year: ${new Date().getFullYear()}.
Your goal is to output exactly ONE JSON object containing TMDB discovery parameters based on the user's swipe history (likes, dislikes, watchlist).
Use ONLY valid TMDB Discover parameters. Do NOT use keywords since you do not have their exact TMDB IDs.
Valid Genres IDs: 28 (Action), 12 (Adventure), 16 (Animation), 35 (Comedy), 80 (Crime), 99 (Documentary), 18 (Drama), 10751 (Family), 14 (Fantasy), 36 (History), 27 (Horror), 10402 (Music), 9648 (Mystery), 10749 (Romance), 878 (Sci-Fi), 10770 (TV Movie), 53 (Thriller), 10752 (War), 37 (Western).

JSON Format:
{
  "with_genres": "string (e.g. '28,12' for Action AND Adventure, or '28|12' for Action OR Adventure. Max 2-3)",
  "without_genres": "string (IDs to exclude)",
  "primary_release_date.gte": "string (YYYY-MM-DD)",
  "primary_release_date.lte": "string (YYYY-MM-DD)",
  "vote_average.gte": "number (0-10)",
  "with_original_language": "string (e.g. 'en|it|es|fr|ko|ja')"
}
You MUST reply with JSON ONLY. No markdown, no prose. Keep filters loose to avoid 0 results.`;

/**
 * Inizializza una sessione di Matchmaker.
 */
async function initMatchmakerSession(req, res) {
    const { id: profileId } = req.params;
    const { userId, type = 'movie', vibeOrRandom = 'random' } = req.body;

    if (!userId) return res.status(400).json({ error: 'userId required' });

    try {
        const sessionId = `match_${nanoid(10)}`;
        
        // Inizializza stato sessione
        const sessionState = {
            userId,
            profileId,
            type,
            iteration: 0,
            likedIds: [],
            dislikedIds: [],
            watchlistIds: [],
            localDnaParams: {}
        };

        // Chiamata TMDB base per generare il primo set di carte
        // Se 'vibeOrRandom' è 'random', facciamo un mix di generi o simili dal vero DNA.
        // Se è 'vibes' facciamo una prima chiamata a mistral per convertire la stringa in keyword.

        let initialParams = {};
        const account = await UserAccount.findOne({ userId }).lean();
        const activeMistralKey = account?.apiKeys?.mistral || process.env.MISTRAL_API_KEY;
        const tmdbApiKey = account?.apiKeys?.tmdb || process.env.TMDB_API_KEY;

        if (vibeOrRandom !== 'random' && activeMistralKey) {
            const client = new Mistral({ apiKey: activeMistralKey });
            const prompt = `User vibe request: "${vibeOrRandom}". Translate this into TMDB parameters (with_genres, with_keywords).`;
            try {
                const response = await client.chat.complete({
                    model: 'mistral-large-latest',
                    messages: [
                        { role: 'system', content: MATCHMAKER_SYSTEM_PROMPT },
                        { role: 'user', content: prompt }
                    ],
                    response_format: { type: 'json_object' }
                });
                initialParams = safeJsonParse(response.choices?.[0]?.message?.content) || {};
            } catch (err) {
                console.error('[Matchmaker] Init Mistral error:', err);
            }
        }

        sessionState.localDnaParams = initialParams;
        await matchmakerSessionCache.set(sessionId, sessionState);

        // Fetch prime carte (10)
        const tmdbClient = createTmdbClient(tmdbApiKey);
        const baseParams = {
            ...initialParams,
            language: 'it-IT',
            include_adult: false
        };
        const endpoint = type === 'movie' ? '/discover/movie' : '/discover/tv';
        const results = await fetchTmdbCatalogDirect(tmdbClient, endpoint, 1, baseParams, type, 1);
        
        // Return 10
        const cards = (results?.items || []).slice(0, CARDS_PER_BATCH).map(c => ({
            id: String(c.id).replace('tmdb:', ''),
            title: c.name,
            poster: c.poster,
            year: c.releaseInfo,
            overview: c.description,
            genre_ids: c.genre_ids,
            type
        }));

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
    // swipes: [{ id, action: 'like' | 'dislike' | 'watchlist' }]

    if (!userId || !sessionId) return res.status(400).json({ error: 'userId and sessionId required' });

    try {
        const sessionStateData = await matchmakerSessionCache.getWithStatus(sessionId);
        const sessionState = sessionStateData?.value;
        if (!sessionState) return res.status(404).json({ error: 'Session expired or not found' });

        // Update local session arrays
        (swipes || []).forEach(s => {
            if (s.action === 'like') sessionState.likedIds.push(s.id);
            if (s.action === 'dislike') sessionState.dislikedIds.push(s.id);
            if (s.action === 'watchlist') sessionState.watchlistIds.push(s.id);
        });

        sessionState.iteration += 1;

        if (sessionState.iteration >= MAX_ITERATIONS) {
            // Force end
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
        let newParams = sessionState.localDnaParams;

        // Mistral Re-Evaluation every N swipes
        if (activeMistralKey && swipes && swipes.length > 0) {
            const client = new Mistral({ apiKey: activeMistralKey });
            const prompt = `The user liked TMDB IDs: ${sessionState.likedIds.slice(-5).join(', ')}. The user disliked TMDB IDs: ${sessionState.dislikedIds.slice(-5).join(', ')}. The user added to watchlist: ${sessionState.watchlistIds.slice(-3).join(', ')}. Adjust parameters to find better matches. Previous params: ${JSON.stringify(sessionState.localDnaParams)}.`;
            try {
                const response = await client.chat.complete({
                    model: 'mistral-large-latest',
                    messages: [
                        { role: 'system', content: MATCHMAKER_SYSTEM_PROMPT },
                        { role: 'user', content: prompt }
                    ],
                    response_format: { type: 'json_object' }
                });
                newParams = safeJsonParse(response.choices?.[0]?.message?.content) || newParams;
                console.log(`[Matchmaker] Mistral output per iterazione ${sessionState.iteration + 1}:`, newParams);
            } catch (err) {
                console.error('[Matchmaker] Analyze Mistral error:', err);
            }
        }

        sessionState.localDnaParams = newParams;
        await matchmakerSessionCache.set(sessionId, sessionState);

        const tmdbClient = createTmdbClient(tmdbApiKey);
        const baseParams = {
            ...sessionState.localDnaParams,
            ...newParams,
            language: 'it-IT',
            include_adult: false
        };
        const endpoint = sessionState.type === 'movie' ? '/discover/movie' : '/discover/tv';
        let pageToFetch = sessionState.iteration + 1;
        
        console.log(`[Matchmaker] Fetching TMDB ${endpoint} page ${pageToFetch} with params:`, baseParams);
        let results = await fetchTmdbCatalogDirect(tmdbClient, endpoint, pageToFetch, baseParams, sessionState.type, 1);
        
        // Fallback: se Mistral ha generato parametri troppo restrittivi o keyword inesistenti
        if (!results?.items || results.items.length === 0) {
            console.log(`[Matchmaker] TMDB returned 0 results. Fallback to looser params.`);
            const fallbackParams = { language: 'it-IT', include_adult: false, with_genres: baseParams.with_genres };
            results = await fetchTmdbCatalogDirect(tmdbClient, endpoint, pageToFetch, fallbackParams, sessionState.type, 1);
            if (!results?.items || results.items.length === 0) {
                console.log(`[Matchmaker] Extreme fallback for page 1.`);
                // Extreme fallback and restarting from page 1 since pageToFetch may be too high for these limits
                results = await fetchTmdbCatalogDirect(tmdbClient, endpoint, 1, { language: 'it-IT', include_adult: false }, sessionState.type, 1);
            }
        }

        
        // Evitiamo dupes
        const seenIds = new Set([...sessionState.likedIds, ...sessionState.dislikedIds, ...sessionState.watchlistIds]);
        
        const cards = (results?.items || [])
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
            if (s.action === 'like') sessionState.likedIds.push(s.id);
            if (s.action === 'dislike') sessionState.dislikedIds.push(s.id);
            if (s.action === 'watchlist') sessionState.watchlistIds.push(s.id);
        });

        // Genera il Custom Catalog
        const winningIds = Array.from(new Set([...sessionState.likedIds, ...sessionState.watchlistIds]));
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
            }
        }

        // Pulisce cache
        // delete è gestito dal TTL ma possiamo forzare
        await matchmakerSessionCache.set(sessionId, null);

        res.json({ success: true });
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
