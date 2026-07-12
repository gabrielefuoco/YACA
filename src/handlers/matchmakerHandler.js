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
const CARDS_PER_BATCH = 12;

// Prompt Mistral per il Matchmaker strutturato come querySynthesizer
const MATCHMAKER_SYSTEM_PROMPT = `You are the YACA Matchmaker AI, a cinematic sommelier. Current Year: ${new Date().getFullYear()}.

### DECISION LOGIC (FOLLOW STRICTLY):
1. STRATEGY: "matchmaker_refinement"
   - INPUT: User swipe history (liked/disliked titles with genres) in chronological order.
   - OUTPUT: ARRAY of EXACTLY 2 "discovery" query objects. Optionally, ONE of these objects can be a "Question" if you need to resolve a dilemma in the user's taste.
   - GOAL: Target vibes the user likes based on their MOST RECENT choices. Avoid vibes tied to dislikes.

### PARAMETER EXTRACTION RULES:
- GENRES: Map to TMDB numerical IDs (Action → 28, Adventure → 12, Animation → 16, Comedy → 35, Crime → 80, Documentary → 99, Drama → 18, Family → 10751, Fantasy → 14, History → 36, Horror → 27, Music → 10402, Mystery → 9648, Romance → 10749, Sci-Fi → 878, TV Movie → 10770, Thriller → 53, War → 10752, Western → 37)
- LOGIC OPERATORS: USE PIPE (|) for OR combinations to ensure broad, high-quality results. (e.g. "878|28"). DO NOT use arrays.
- KEYWORDS: You can optionally include a "keyword" string to target specific themes (e.g., "cyberpunk", "space opera").
- CRITICAL: NEVER leave "genre_ids" null. You MUST infer and provide the closest numerical TMDB genre IDs for EVERY Vibe Object.

### EXAMPLES (FEW-SHOT):
User liked: "Inception" (Sci-Fi, Action), "Interstellar" (Drama, Sci-Fi)
User disliked: "The Notebook" (Romance, Drama)
→ Output:
[
  { "vibe": "Mind-bending Sci-Fi", "genre_ids": "878|28", "keyword": "mindfuck" },
  { "is_question": true, "text": "Are we looking for deep space or cyberpunk streets?", "options": [{ "label": "Deep Space", "genre_ids": "878" }, { "label": "Cyberpunk", "genre_ids": "878|28" }] },
  { "vibe": "Epic Space Drama", "genre_ids": "878|18" }
]

### RESPONSE FORMAT (JSON ARRAY ONLY):
Array containing mix of Vibe Objects: { "vibe": "string", "genre_ids": "string", "keyword": "string" | null }
(NOTE: "genre_ids" is REQUIRED for every Vibe Object. Do not omit it.)
AND (optionally) ONE Question Object: { "is_question": true, "text": "string", "options": [{ "label": "string", "genre_ids": "string" }] }`;


/**
 * Estrae una QuestionCard (se presente) dalle queries generate da Mistral.
 */
function extractQuestionCard(queries) {
    if (!Array.isArray(queries)) return null;
    const qIndex = queries.findIndex(q => q.is_question);
    if (qIndex !== -1) {
        const q = queries.splice(qIndex, 1)[0];
        
        const normalizedOptions = (q.options || []).map(opt => {
            let g = opt.genre_ids;
            if (typeof g === 'string') {
                g = g.split(/[|,]/).map(Number).filter(n => !isNaN(n));
            }
            return { ...opt, genre_ids: Array.isArray(g) ? g.map(Number) : [] };
        });

        return {
            id: 'question_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
            type: 'question',
            is_question: true,
            title: 'Interactive Question',
            question_text: q.text || q.vibe || 'Question',
            question_options: normalizedOptions,
            poster: null,
            overview: '',
            year: '',
            genre_ids: []
        };
    }
    return null;
}

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
    const { userId, type = 'movie', vibeOrRandom = 'random', initialGenres } = req.body;

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
            animeOverrides,
            mistralQueryBuffer: [],
            lastIterationItems: []
        };

        const account = await UserAccount.findOne({ userId }).lean();
        const activeMistralKey = account?.apiKeys?.mistral || process.env.MISTRAL_API_KEY;
        const tmdbApiKey = account?.apiKeys?.tmdb || process.env.TMDB_API_KEY;

        let parsedQueries = [];
        const dnaContext = await getMatchmakerDnaContext(userId, profileId);

        // BYPASS Mistral al turno 0 se siamo in modalità esplorativa, per un avvio fulmineo.
        // Mistral subentrerà in analyzeMatchmakerSession con lo storico reale.
        if (vibeOrRandom === 'random') {
            parsedQueries = [
                { vibe: 'Esplorazione Iniziale', genre_ids: (initialGenres && initialGenres.length > 0) ? initialGenres : null },
                { vibe: 'Popolari & Rilevanti', genre_ids: (initialGenres && initialGenres.length > 0) ? initialGenres : null }
            ];
            sessionState.mistralQueryBuffer = [];
            console.log(`[Matchmaker] Init Fast Boot: Bypassed Mistral at Turn 0 for immediate start.`);
        }
        else if (activeMistralKey) {
            const client = new Mistral({ apiKey: activeMistralKey });
            
            let userPrompt = `User vibe request: "${vibeOrRandom}". Generate discovery queries.`;
            
            if (initialGenres && initialGenres.length > 0) {
                const genreNames = genreIdsToNames(initialGenres);
                userPrompt += `\nThe user explicitly selected these starting genres: ${genreNames} (IDs: ${initialGenres.join(', ')}). You MUST include these in your discovery queries.`;
            }

            userPrompt = dnaContext 
                ? `${userPrompt}\n\nUser's Taste DNA for context:\n${dnaContext}`
                : userPrompt;

            try {
                const response = await callMistralWithRetry(client, [
                    { role: 'system', content: MATCHMAKER_SYSTEM_PROMPT },
                    { role: 'user', content: userPrompt }
                ]);
                parsedQueries = parseQuerySynthesizerResponse(response.choices?.[0]?.message?.content);
                // Buffer eliminato: Mistral agirà ad ogni round in tempo reale
                sessionState.mistralQueryBuffer = [];
            } catch (err) {
                console.error('[Matchmaker] Init Mistral error:', err);
            }
        }
        
        // Fallback queries in case Mistral fails or is disabled
        if (parsedQueries.length === 0) {
            parsedQueries = [{ vibe: 'Popular', genre_ids: (initialGenres && initialGenres.length > 0) ? initialGenres : null }];
        }

        console.log(`[Matchmaker] Init session ${sessionId}, user ${userId}, type: ${type}, mode: ${vibeOrRandom}`);
        console.log(`[Matchmaker] DNA: "${dnaContext || 'none'}"`);
        console.log(`[Matchmaker] Mistral response (${parsedQueries.length} queries):`, JSON.stringify(parsedQueries));

        const questionCard = extractQuestionCard(parsedQueries);
        if (questionCard && parsedQueries.length === 0) {
            parsedQueries = [{ vibe: 'Popular Continuation', genre_ids: null }];
        }

        // Costruisci catalogo universale
        const universalCatalog = {
            queries: parsedQueries.map(q => {
                let query = { strategy: 'discovery' };
                if (q.genre_ids && String(q.genre_ids).trim() !== "null" && String(q.genre_ids).trim() !== "undefined") {
                    query.with_genres = Array.isArray(q.genre_ids) ? q.genre_ids.join('|') : String(q.genre_ids);
                }
                if (q.keyword && String(q.keyword).trim() !== "null" && String(q.keyword).trim() !== "undefined") {
                    query.with_keywords = String(q.keyword);
                }
                
                // Merge overrides anime se presenti
                if (sessionState.animeOverrides.with_genres) {
                    let currentGenres = query.with_genres 
                        ? query.with_genres.split(/[|,]/)
                        : [];
                    query.with_genres = [...new Set([...currentGenres, ...sessionState.animeOverrides.with_genres])].join('|');
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
        
        if (questionCard) {
            if (cards.length >= 2) cards.splice(2, 0, questionCard);
            else cards.push(questionCard);
        }
        
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
        if (swipes && Array.isArray(swipes)) {
            sessionState.cardHistory.push(...swipes);
            
            const answered = swipes.filter(s => s.action === 'answered');
            if (answered.length > 0) {
                // Svuotiamo il buffer per forzare una rigenerazione con il nuovo contesto esplicito
                sessionState.mistralQueryBuffer = [];
            }
            swipes.forEach(s => {
                if (s.action === 'like') sessionState.likedIds.push(s.id);
                if (s.action === 'dislike') sessionState.dislikedIds.push(s.id);
                if (s.action === 'watchlist') sessionState.watchlistIds.push(s.id);
            });
        }

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
            
            // Format cronologico della history per dare a Mistral il senso del tempo/evoluzione
            const historyStr = sessionState.cardHistory.map((c, i) => {
                let text = `[Swipe ${i+1}] Title: "${c.title}" (Genres: ${genreIdsToNames(c.genre_ids)}) -> `;
                if (c.action === 'like') text += `LIKED`;
                else if (c.action === 'dislike') text += `DISLIKED`;
                else if (c.action === 'watchlist') text += `SAVED TO WATCHLIST`;
                else if (c.action === 'answered') text += `EXPLICITLY CHOSE THIS PATH`;
                return text;
            }).join('\n');
            const tmdbClient = createTmdbClient(tmdbApiKey);
            let sessionMicroDna = null;

            // Preleviamo solo gli ultimissimi 3 like per evitare di impantanarci (echo chamber) sulle prime keyword in assoluto
            const likedItems = sessionState.cardHistory.filter(c => c.action === 'like' || c.action === 'watchlist').slice(-3);
            
            if (likedItems.length > 0) {
                const keywordPromises = likedItems.map(async (item) => {
                    if (item.keywords && Array.isArray(item.keywords)) return item.keywords;
                    try {
                        const isTv = sessionState.type === 'series' || sessionState.type === 'anime';
                        const rawId = String(item.id).replace('tmdb:', '');
                        const endpoint = isTv ? `/tv/${rawId}/keywords` : `/movie/${rawId}/keywords`;
                        const res = await tmdbClient.get(endpoint);
                        const kws = isTv ? (res.data.results || []) : (res.data.keywords || []);
                        const kwNames = kws.map(k => k.name).filter(Boolean);
                        item.keywords = kwNames;
                        return kwNames;
                    } catch (e) {
                        console.warn(`[Matchmaker] Failed to fetch keywords for ${item.id}`);
                        return [];
                    }
                });

                const allKeywords = await Promise.all(keywordPromises);
                
                const kwFreq = {};
                allKeywords.flat().forEach(kw => {
                    kwFreq[kw] = (kwFreq[kw] || 0) + 1;
                });
                const topKeywords = Object.entries(kwFreq)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(e => e[0]);
                
                const genreFreq = {};
                likedItems.forEach(item => {
                    if (item.genre_ids) {
                        item.genre_ids.forEach(gid => {
                            genreFreq[gid] = (genreFreq[gid] || 0) + 1;
                        });
                    }
                });
                const topGenresIds = Object.entries(genreFreq)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 3)
                    .map(e => Number(e[0]));
                
                const topGenresNames = genreIdsToNames(topGenresIds);

                if (topKeywords.length > 0 || topGenresNames) {
                    sessionMicroDna = `[Session Micro-DNA - Based ONLY on the LAST 3 Likes]:\n` +
                        `Emerging Genres: ${topGenresNames}\n` +
                        `Emerging Official TMDB Keywords: ${topKeywords.join(', ')}\n` +
                        `IMPORTANT: Use these keywords as INSPIRATION to explore adjacent/similar vibes. DO NOT repeat the exact same keywords over and over across iterations. Mix them up!`;
                }
            }
                
            let prompt = `Here is the user's chronological swipe history from the beginning of the session to the most recent swipe:\n${historyStr}\n\n`;
            if (sessionMicroDna) prompt += `${sessionMicroDna}\n\n`;
            prompt += `Analyze this evolution in taste. What are they leaning towards NOW based on the most recent swipes? Generate EXACTLY 2 new discovery queries to find better matches. If their recent choices are conflicting or unclear, generate a 3rd Question object to steer them.`;
            
            try {
                const response = await callMistralWithRetry(client, [
                    { role: 'system', content: MATCHMAKER_SYSTEM_PROMPT },
                    { role: 'user', content: prompt }
                ]);
                parsedQueries = parseQuerySynthesizerResponse(response.choices?.[0]?.message?.content);
                sessionState.mistralQueryBuffer = [];
                console.log(`[Matchmaker] Mistral generated ${parsedQueries.length} fresh queries:`, JSON.stringify(parsedQueries));
            } catch (err) {
                console.error('[Matchmaker] Analyze Mistral error:', err);
            }
        }

        if (parsedQueries.length === 0) {
            parsedQueries = [{ vibe: 'Popular Continuation', genre_ids: null }];
        }
        
        const questionCard = extractQuestionCard(parsedQueries);
        if (questionCard && parsedQueries.length === 0) {
            parsedQueries = [{ vibe: 'Popular Continuation', genre_ids: null }];
        }
        
        await matchmakerSessionCache.set(sessionId, sessionState);

        const universalCatalog = {
            queries: parsedQueries.map(q => {
                let query = { strategy: 'discovery' };
                if (q.genre_ids && String(q.genre_ids).trim() !== "null" && String(q.genre_ids).trim() !== "undefined") {
                    query.with_genres = Array.isArray(q.genre_ids) ? q.genre_ids.join('|') : String(q.genre_ids);
                }
                if (q.keyword && String(q.keyword).trim() !== "null" && String(q.keyword).trim() !== "undefined") {
                    query.with_keywords = String(q.keyword);
                }
                
                // Fallback di sicurezza: se Mistral ha omesso i generi (generando solo keyword o roba vuota), peschiamo l'ultimo genere piaciuto
                if (!query.with_genres && sessionState.cardHistory) {
                    const lastLiked = sessionState.cardHistory.filter(c => c.action === 'like' || c.action === 'watchlist').pop();
                    if (lastLiked && lastLiked.genre_ids && lastLiked.genre_ids.length > 0) {
                        query.with_genres = String(lastLiked.genre_ids[0]);
                    }
                }
                
                // Merge overrides anime
                if (sessionState.animeOverrides?.with_genres) {
                    let currentGenres = query.with_genres 
                        ? query.with_genres.split(/[|,]/)
                        : [];
                    query.with_genres = [...new Set([...currentGenres, ...sessionState.animeOverrides.with_genres])].join('|');
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
        console.log(`[Matchmaker] Iteration ${sessionState.iteration} - Pipeline returned ${rawItems?.length || 0} items`);
        
        // Ordina per DNA
        const sortedItems = await sortByDnaAffinity(rawItems || [], userId, profileId);
        
        // Evitiamo dupes
        const seenIds = new Set([...sessionState.likedIds, ...sessionState.dislikedIds, ...sessionState.watchlistIds]);
        
        sessionState.lastIterationItems = sortedItems
            .map(c => ({ ...c, rawId: String(c.id).replace('tmdb:', '') }))
            .filter(c => !seenIds.has(c.rawId));

        const cards = sessionState.lastIterationItems
            .slice(0, CARDS_PER_BATCH).map(c => ({
                id: c.rawId,
                title: c.name,
                poster: c.poster,
                year: c.releaseInfo,
                overview: c.description,
                genre_ids: c.genre_ids,
                type: sessionState.type
            }));

        if (questionCard) {
            if (cards.length >= 2) cards.splice(2, 0, questionCard);
            else cards.push(questionCard);
        }

        // Salvo la sessione qui per aggiornare lastIterationItems
        await matchmakerSessionCache.set(sessionId, sessionState);

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
        let expandedIds = [...winningIds];
        let savedCatalog = null;
        
        const account = await UserAccount.findOne({ userId }).lean();

        if (winningIds.length > 0) {
            // Expanded catalog logic using lastIterationItems
            const extraIds = (sessionState.lastIterationItems || [])
                .map(c => c.rawId || String(c.id).replace('tmdb:', ''))
                .filter(id => !expandedIds.includes(id))
                .slice(0, 40);
            
            expandedIds = [...expandedIds, ...extraIds];

            const catalogId = `custom_matchmaker_${nanoid(8)}`;
            const newCatalog = {
                id: catalogId,
                name: `Matchmaker Mix (${new Date().toLocaleDateString()})`,
                type: sessionState.type,
                source: 'custom',
                emoji: '💖',
                presentation_strategy: 'popularity',
                queries: expandedIds.map(id => ({
                    strategy: 'manual_list',
                    params: { with_id: id }
                }))
            };

            if (account?.addonUuid) {
                await AddonConfig.updateOne(
                    { uuid: account.addonUuid },
                    { $push: { customCatalogs: newCatalog } }
                );
                
                savedCatalog = {
                    id: catalogId,
                    name: newCatalog.name,
                    itemCount: expandedIds.length,
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

/**
 * Fetch YouTube trailer on demand per il Matchmaker UI
 */
async function getMatchmakerTrailer(req, res) {
    const { type, itemId } = req.params;
    const { userId } = req.query; // opzionale
    
    try {
        let tmdbApiKey = process.env.TMDB_API_KEY;
        if (userId) {
            const account = await UserAccount.findOne({ userId }).lean();
            if (account?.apiKeys?.tmdb) tmdbApiKey = account.apiKeys.tmdb;
        }
        
        const tmdbClient = createTmdbClient(tmdbApiKey);
        const cleanId = String(itemId).replace('tmdb:', '');
        const endpointType = type === 'series' ? 'tv' : (type === 'anime' ? 'tv' : 'movie');
        
        const { data } = await tmdbClient.get(`/${endpointType}/${cleanId}`, {
            params: { append_to_response: 'videos' }
        });
        
        const videos = data.videos?.results || [];
        const trailer = videos.find(v => v.site === 'YouTube' && v.type === 'Trailer') ||
                        videos.find(v => v.site === 'YouTube' && v.type === 'Teaser') ||
                        videos.find(v => v.site === 'YouTube');
        
        if (trailer) {
            return res.json({ success: true, trailerUrl: `https://www.youtube.com/embed/${trailer.key}?autoplay=1&controls=0&modestbranding=1` });
        }
        res.json({ success: false, message: 'No trailer found' });
    } catch (err) {
        console.error('[Matchmaker] Error fetching trailer:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
}

module.exports = {
    initMatchmakerSession,
    analyzeMatchmakerSession,
    finishMatchmakerSession,
    getMatchmakerTrailer
};
