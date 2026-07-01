require('dotenv').config({ path: '../.env' });
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

async function getLocalConfig() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const db = mongoose.connection.db;
        const account = await db.collection('useraccounts').findOne({});
        await mongoose.disconnect();
        return account ? account.addonUuid : null;
    } catch (e) {
        console.error("Failed to fetch config from MongoDB:", e.message);
        return null;
    }
}

function extractSeasonEpisode(trBadge, tlBadge) {
    let season = 1;
    let episode = 1;
    
    // Fallback season from tlBadge (e.g., "S2", "S 3", "ITA - S1")
    if (tlBadge) {
        const tlMatch = tlBadge.match(/S\s*(\d+)/i);
        if (tlMatch) season = parseInt(tlMatch[1], 10);
    }
    
    if (trBadge) {
        // Match things like "Ep 356", "S2 E12", "S 2 Ep 12", "S1 E1"
        const trMatch = trBadge.match(/(?:S\s*(\d+)\s*)?E(?:p)?\s*(\d+)/i);
        if (trMatch) {
            if (trMatch[1]) season = parseInt(trMatch[1], 10);
            if (trMatch[2]) episode = parseInt(trMatch[2], 10);
        }
    }
    
    return { season, episode };
}

async function run() {
    const args = process.argv.slice(2);
    let pages = 1;
    let config = null;
    let catalogsArg = 'all';
    let compact = false;
    let stdout = false;
    let nocache = false;
    let fetchStreams = false;
    let useLocal = false;
    let formatText = false; // Add text formatting option
    
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--pages' && args[i+1]) pages = parseInt(args[++i], 10);
        else if (args[i] === '--config' && args[i+1]) config = args[++i];
        else if (args[i] === '--catalogs' && args[i+1]) catalogsArg = args[++i];
        else if (args[i] === '--compact') compact = true;
        else if (args[i] === '--stdout') stdout = true;
        else if (args[i] === '--nocache') nocache = true;
        else if (args[i] === '--streams') fetchStreams = true;
        else if (args[i] === '--local') useLocal = true;
        else if (args[i] === '--text') formatText = true;
    }
    
    if (!config) {
        if (!stdout) console.log("No config provided. Auto-fetching from MongoDB...");
        config = await getLocalConfig();
    }

    if (!config) {
        // Fallback default config if MongoDB fails or is not available
        config = 'eyJhcGlLZXlzIjp7InRtZGIiOiJjOTE2YTkyZDM3MGVhZmQ1OGVlZDg2ZGQ3M2UzZGNhMCJ9LCJhY3RpdmVQcm9maWxlSWQiOiJkZWZhdWx0IiwicHJvZmlsZXMiOlt7ImlkIjoiZGVmYXVsdCIsInNldHRpbmdzIjp7ImFuaW1lSWRNb2RlIjoia2l0c3UifX1dfQ==';
        if (!stdout) console.log("Using default fallback config.");
    }
    
    const baseUrl = useLocal ? 'http://127.0.0.1:7000' : 'https://gabriele-fuoco-yaca.hf.space';
    let targetCatalogs = [];
    
    try {
        const manifestRes = await axios.get(`${baseUrl}/${config}/manifest.json`, { timeout: 10000 });
        const manifestCatalogs = manifestRes.data.catalogs || [];
        
        if (catalogsArg === 'all') {
            targetCatalogs = manifestCatalogs;
        } else {
            const specificIds = catalogsArg.split(',').map(s => s.trim());
            targetCatalogs = manifestCatalogs.filter(c => specificIds.includes(c.id));
        }
    } catch (e) {
        console.error("Failed to fetch manifest:", e.message);
        process.exit(1);
    }
    
    if (targetCatalogs.length === 0) {
        console.log("No catalogs found matching criteria.");
        return;
    }
    
    const allData = {};
    let textOutput = '';
    
    for (const cat of targetCatalogs) {
        if (!stdout) console.log(`Fetching catalog: ${cat.id} (${cat.type})...`);
        const catData = { id: cat.id, name: cat.name, items: [] };
        
        if (formatText) {
            textOutput += `\n\n=== Catalog: ${cat.id} ===\n`;
        }
        
        for (let page = 0; page < pages; page++) {
            const skip = page * 20;
            const skipPath = skip > 0 ? `/skip=${skip}` : '';
            
            // To bypass cache, we pass a random query parameter which alters the cache key hash
            const cacheBuster = nocache ? `?_nocache=${Date.now()}` : '';
            const url = `${baseUrl}/${config}/catalog/${cat.type}/${cat.id}${skipPath}.json${cacheBuster}`;
            
            try {
                const res = await axios.get(url, { timeout: 15000 });
                const metas = res.data.metas || [];
                
                if (metas.length === 0) break; 
                
                for (let i = 0; i < metas.length; i++) {
                    const meta = metas[i];
                    let tlBadge = null;
                    let trBadge = null;
                    
                    const poster = meta.poster;
                    if (poster && poster.includes('/images/poster/')) {
                        try {
                            const pUrl = new URL(poster);
                            const pathParts = pUrl.pathname.split('/');
                            const epBadge = decodeURIComponent(pathParts[5] || '_');
                            const tl = pUrl.searchParams.get('tlBadge');
                            
                            if (epBadge && epBadge !== '_') trBadge = epBadge;
                            if (tl) tlBadge = decodeURIComponent(tl);
                        } catch (err) {}
                    }
                    
                    if (formatText) {
                        textOutput += `${(skip + i + 1).toString().padStart(2, ' ')}. ${meta.name.padEnd(50)} | Season: ${(tlBadge || 'None').padEnd(10)} | Ep: ${trBadge || 'None'}\n`;
                    }
                    
                    const itemData = {
                        id: meta.id,
                        type: meta.type,
                        name: meta.name,
                        tlBadge,
                        trBadge
                    };
                    
                    if (!compact && !formatText) {
                        itemData.poster = meta.poster;
                        itemData.description = meta.description;
                        itemData.releaseInfo = meta.releaseInfo;
                        itemData.imdbRating = meta.imdbRating;
                        itemData.runtime = meta.runtime;
                        itemData.genres = meta.genres;
                    }

                    if (fetchStreams && !formatText) {
                        let streamId = meta.id;
                        if (meta.type === 'series' || meta.type === 'anime') {
                            const { season, episode } = extractSeasonEpisode(trBadge, tlBadge);
                            const cleanId = String(meta.id).replace('_ita_offset', '');
                            streamId = `${cleanId}:${season}:${episode}`;
                        }

                        const streamUrl = `${baseUrl}/${config}/stream/${meta.type}/${streamId}.json`;
                        try {
                            const sRes = await axios.get(streamUrl, { timeout: 10000 });
                            const streams = sRes.data.streams || [];
                            itemData.streams = streams.map(s => ({
                                name: s.name,
                                title: s.title
                            }));
                        } catch (se) {
                            itemData.streams = [{ error: `Failed to fetch streams: ${se.message}` }];
                        }
                    }
                    
                    catData.items.push(itemData);
                }
                
                if (metas.length < 20) break; 
                
            } catch (e) {
                if (!stdout) console.error(`Error fetching page ${page} for ${cat.id}:`, e.message);
                break;
            }
        }
        
        allData[cat.id] = catData;
    }
    
    if (stdout) {
        if (formatText) {
            console.log(textOutput);
        } else {
            console.log(JSON.stringify(allData, null, 2));
        }
    } else {
        if (formatText) {
            const outPath = path.join(__dirname, '..', 'catalogs_output.txt');
            fs.writeFileSync(outPath, textOutput);
            console.log(`Saved textual state to ${outPath}`);
        } else {
            const outPath = compact 
                ? path.join(__dirname, '..', 'catalog_state_compact.json') 
                : path.join(__dirname, '..', 'catalog_state.json');
            fs.writeFileSync(outPath, JSON.stringify(allData, null, 2));
            console.log(`Saved JSON state to ${outPath}`);
        }
    }
}

run();
