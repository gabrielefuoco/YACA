require('dotenv').config({ path: 'secrets.env' });
const mongoose = require('mongoose');
const { stremioClient } = require('../../src/clients/stremio');
const { sanitizeCatalogMeta } = require('../../src/catalog/formatters/StremioFormatter');
const UserAccount = require('../../src/db/models/UserAccount');
const AddonConfig = require('../../src/db/models/AddonConfig');
const { createTmdbClient } = require('../../src/clients/tmdb');

const TMDB_KEY = process.env.TMDB_API_KEY;
const tmdbClient = createTmdbClient(TMDB_KEY);

async function run() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGODB_URI);
        
        const targetUser = await UserAccount.findOne({});
        const authKey = targetUser.apiKeys?.stremio;
        
        let userConfig = null;
        if (targetUser.addonUuid) {
            userConfig = await AddonConfig.findOne({ uuid: targetUser.addonUuid }).lean();
        }

        const searchRes = await tmdbClient.get('/search/movie', { params: { query: 'Chiedimi se sono felice', language: 'it-IT' } });
        const tmdbItem = searchRes.data.results[0];
        const detailRes = await tmdbClient.get(`/movie/${tmdbItem.id}`);
        const imdbId = detailRes.data.imdb_id;
        
        let meta = {
            id: imdbId,
            tmdbId: tmdbItem.id,
            type: 'movie',
            name: tmdbItem.title,
            poster: `https://image.tmdb.org/t/p/w500${tmdbItem.poster_path}`,
            posterShape: 'poster',
            background: `https://image.tmdb.org/t/p/original${tmdbItem.backdrop_path}`,
            releaseInfo: tmdbItem.release_date ? tmdbItem.release_date.split('-')[0] : '',
            _itaBadge: true
        };
        
        const sanitizeOptions = {
            userConfig: userConfig,
            hostUrl: 'https://gabriele-fuoco-yaca.hf.space',
            shouldApplyEpisodeBadge: false
        };

        meta = sanitizeCatalogMeta(meta, sanitizeOptions);
        if (meta.poster) {
            meta.poster = meta.poster + '&t=' + Date.now();
        }

        const now = new Date().toISOString();
        const changes = [{
            _id: meta.id,
            name: meta.name || '',
            type: meta.type || 'movie',
            poster: meta.poster || null,
            posterShape: meta.posterShape || 'poster',
            background: meta.background || null,
            logo: meta.logo || null,
            year: meta.releaseInfo ? meta.releaseInfo.toString() : null,
            removed: false,
            temp: false,
            _ctime: now,
            _mtime: now,
            state: { timeOffset: 0, video_id: null, season: 1, episode: 1, timeAsPercentage: 0, noNotifs: false }
        }];

        const res = await stremioClient.post('/api/datastorePut', {
            type: 'DatastorePut',
            authKey,
            collection: 'libraryItem',
            changes
        }, { timeout: 10000 });
        
        console.log("Risultato Scrittura Libreria:", res.data);

    } catch (err) {
        console.error("Errore generale:", err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
