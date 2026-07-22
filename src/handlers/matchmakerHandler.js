const { matchmakerSessionCache } = require('../cache/cacheInstances');
const { nanoid } = require('nanoid');
const UserAccount = require('../db/models/UserAccount');
const AddonConfig = require('../db/models/AddonConfig');
const { createTmdbClient } = require('../clients/tmdb');
const { calculateMatchmakerFunnel, getMatchmakerInitCards, getMatchmakerNextCards, getFinalRecommendations } = require('../engines/hybrid/MatchmakerGraphEngine');

async function funnelMatchmakerSession(req, res) {
    const { id: profileId } = req.params;
    const { userId, genres, moods, filters } = req.body;

    if (!userId) return res.status(400).json({ error: 'userId required' });

    try {
        const topL4s = calculateMatchmakerFunnel(genres || [], moods || [], filters || {});
        res.json({
            success: true,
            results: topL4s
        });
    } catch (error) {
        console.error('[Matchmaker] Error funnel:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

async function initMatchmakerSession(req, res) {
    const { id: profileId } = req.params;
    const { userId, type = 'movie', startingL3NodeId, filters } = req.body;

    if (!userId) return res.status(400).json({ error: 'userId required' });

    try {
        const sessionId = `match_${nanoid(10)}`;
        
        // Anime is requested as type 'anime' in UI, but to TMDB it's 'tv' (or 'movie').
        // Our filters.isAnime handles the DuckDB restriction.
        let tmdbType = type;
        if (type === 'anime') {
            tmdbType = 'tv';
            if (!filters) filters = {};
            filters.isAnime = true;
        }

        const sessionState = {
            userId, profileId,
            type: tmdbType,
            originalType: type,
            iteration: 0,
            startingL3NodeId,
            filters: filters || {},
            likedIds: [], dislikedIds: [], watchlistIds: [],
            cardHistory: [],
            currentLevel: 'L2' // Iniziamo da L2 (Topos) visto che abbiamo l'L3
        };

        const cards = await getMatchmakerInitCards(tmdbType, startingL3NodeId, sessionState.filters);
        
        await matchmakerSessionCache.set(sessionId, sessionState);

        res.json({
            success: true,
            sessionId,
            iteration: 0,
            maxIterations: 4, 
            cards
        });
    } catch (error) {
        console.error('[Matchmaker] Error init:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

async function analyzeMatchmakerSession(req, res) {
    const { id: profileId } = req.params;
    const { userId, sessionId, swipes } = req.body;

    if (!userId || !sessionId) return res.status(400).json({ error: 'userId and sessionId required' });

    try {
        const sessionStateData = await matchmakerSessionCache.getWithStatus(sessionId);
        const sessionState = sessionStateData?.value;
        if (!sessionState) return res.status(404).json({ error: 'Session expired or not found' });

        if (swipes && Array.isArray(swipes)) {
            swipes.forEach(s => {
                sessionState.cardHistory.push({
                    id: s.id,
                    action: s.action,
                    _graphNodeId: s._graphNodeId || null
                });
                
                if (s.action === 'like') sessionState.likedIds.push(s.id);
                if (s.action === 'dislike') sessionState.dislikedIds.push(s.id);
                if (s.action === 'watchlist') sessionState.watchlistIds.push(s.id);
            });
        }

        sessionState.iteration += 1;

        const nextRes = await getMatchmakerNextCards(sessionState.type, sessionState.cardHistory, sessionState.currentLevel, sessionState.filters);
        
        if (nextRes.isFinal) {
            sessionState.winningNode = nextRes.winningNode;
            await matchmakerSessionCache.set(sessionId, sessionState);
            return res.json({
                success: true,
                endOfGame: true,
                message: 'Reached graph leaf'
            });
        }

        sessionState.currentLevel = nextRes.nextLevel;
        await matchmakerSessionCache.set(sessionId, sessionState);

        res.json({
            success: true,
            iteration: sessionState.iteration,
            maxIterations: 4,
            cards: nextRes.cards
        });

    } catch (error) {
        console.error('[Matchmaker] Error analyze:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

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
            if (s.action === 'watchlist') sessionState.watchlistIds.push(s.id);
        });

        const winningIds = Array.from(new Set([...sessionState.likedIds, ...sessionState.watchlistIds])).map(i => String(i).replace('tmdb:', ''));
        let expandedIds = [...winningIds];
        
        if (sessionState.winningNode) {
            const finalRecs = await getFinalRecommendations([sessionState.winningNode], sessionState.type, sessionState.filters);
            expandedIds = Array.from(new Set([...expandedIds, ...finalRecs])).slice(0, 40);
        }

        let savedCatalog = null;
        const account = await UserAccount.findOne({ userId }).lean();

        if (expandedIds.length > 0) {
            const catalogId = `custom_matchmaker_${nanoid(8)}`;
            const newCatalog = {
                id: catalogId,
                name: `Matchmaker Mix 💖`,
                type: sessionState.originalType || sessionState.type,
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
                    type: sessionState.originalType || sessionState.type
                };
            }
        }

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

async function getMatchmakerTrailer(req, res) {
    const { type, itemId } = req.params;
    const { userId } = req.query; 
    
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
    funnelMatchmakerSession,
    initMatchmakerSession,
    analyzeMatchmakerSession,
    finishMatchmakerSession,
    getMatchmakerTrailer
};
