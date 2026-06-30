require('dotenv').config();
const axios = require('axios');
const mongoose = require('mongoose');

async function getLocalConfig() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const db = mongoose.connection.db;
        const account = await db.collection('useraccounts').findOne({});
        await mongoose.disconnect();
        return account ? account.addonUuid : null;
    } catch (e) {
        return null;
    }
}

function extractSeasonEpisode(trBadge, tlBadge) {
    let season = 1;
    let episode = 1;
    if (tlBadge) {
        const tlMatch = tlBadge.match(/S\s*(\d+)/i);
        if (tlMatch) season = parseInt(tlMatch[1], 10);
    }
    if (trBadge) {
        const trMatch = trBadge.match(/(?:S\s*(\d+)\s*)?E(?:p)?\s*(\d+)/i);
        if (trMatch) {
            if (trMatch[1]) season = parseInt(trMatch[1], 10);
            if (trMatch[2]) episode = parseInt(trMatch[2], 10);
        }
    }
    return { season, episode };
}

async function run() {
    const config = await getLocalConfig();
    const baseUrl = 'https://gabriele-fuoco-yaca.hf.space';
    
    // Cerchiamo i primi 10 elementi del simulcast (ignora la cache)
    const url = `${baseUrl}/${config}/catalog/series/yaca_preset_preset_anime_simulcast.json?_nocache=${Date.now()}`;
    const res = await axios.get(url);
    const metas = res.data.metas.slice(0, 10);
    
    console.log(`=== ANALISI 10 ELEMENTI SIMULCAST ===\n`);
    let perfectMatch = 0;
    
    for (const meta of metas) {
        let tlBadge = null;
        let trBadge = null;
        if (meta.poster && meta.poster.includes('/images/poster/')) {
            try {
                const pUrl = new URL(meta.poster);
                const pathParts = pUrl.pathname.split('/');
                const epBadge = decodeURIComponent(pathParts[5] || '_');
                const tl = pUrl.searchParams.get('tlBadge');
                if (epBadge && epBadge !== '_') trBadge = epBadge;
                if (tl) tlBadge = decodeURIComponent(tl);
            } catch (e) {}
        }

        const { season, episode } = extractSeasonEpisode(trBadge, tlBadge);
        const cleanId = String(meta.id).replace('_ita_offset', '');
        
        let torrentioId = cleanId;
        // Torrentio si aspetta kitsu:ID:EPISODE (senza la stagione)
        if (cleanId.startsWith('kitsu:')) {
            const kId = cleanId.split(':')[1];
            torrentioId = `kitsu:${kId}:${episode}`;
        } else if (cleanId.startsWith('tmdb:')) {
            const tmdbId = cleanId.split(':')[2];
            torrentioId = `tmdb:${tmdbId}:${season}:${episode}`;
        }

        let streams = [];
        const torrentioUrl = process.env.TORRENTIO_URL || 'https://torrentio.strem.fun/providers=yts,eztv,rarbg,1337x,thepiratebay,kickasstorrents,torrentgalaxy,magnetdl,horriblesubs,nyaasi,tokyotosho,anidex|language=italian';
        try {
            const sRes = await axios.get(`${torrentioUrl}/stream/series/${torrentioId}.json`, { timeout: 10000 });
            streams = sRes.data.streams || [];
        } catch (e) {}

        const expectedEpMatch = (trBadge || '').match(/Ep\s*(\d+)/i) || (trBadge || '').match(/E(\d+)/i);
        const expectedEp = expectedEpMatch ? expectedEpMatch[1] : '?';
        
        // Regex per trovare l'episodio nel nome del torrent, es. " - 12", " E12", " 012"
        const epRegex = new RegExp(`(?:E|Ep| - )0*${expectedEp}(?:\\D|$)`, 'i');
        let foundMatch = false;
        let sampleTitle = '';

        for (const s of streams) {
            if (s.title) {
                const firstLine = s.title.split('\\n')[0].replace(/\n/g, ' ').substring(0, 60);
                if (!sampleTitle) sampleTitle = firstLine;
                if (epRegex.test(s.title)) {
                    foundMatch = true;
                    if (!sampleTitle) sampleTitle = firstLine;
                    break;
                }
            }
        }

        if (streams.length === 0) {
            console.log(`[VUOTO] ${meta.name.substring(0,25).padEnd(25)} | Badge: ${(trBadge||'').padEnd(8)} | Nessun Torrent (T-ID: ${torrentioId})`);
        } else if (foundMatch) {
            perfectMatch++;
            console.log(`[ MATCH  ] ${meta.name.substring(0,25).padEnd(25)} | Badge: ${(trBadge||'').padEnd(8)} | Torrent: ${sampleTitle}`);
        } else {
            console.log(`[MISMATCH] ${meta.name.substring(0,25).padEnd(25)} | Badge: ${(trBadge||'').padEnd(8)} | Torrent errato: ${sampleTitle}`);
        }
    }
    
    console.log(`\nMatch rate: ${perfectMatch}/${metas.length}`);
}

run();
