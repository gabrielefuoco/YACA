const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const axios = require('axios');
const fs = require('fs');
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

async function run() {
    const config = await getLocalConfig();
    if (!config) {
        console.error("Could not find a valid addonUuid in MongoDB.");
        return;
    }
    console.log(`Using config (addonUuid): ${config}`);
    
    const baseUrl = 'http://127.0.0.1:7000';
    const catId = 'preset_anime_simulcast';
    const type = 'series';
    const pages = 6;
    
    let textOutput = `=== Catalog: ${catId} ===\n`;
    
    for (let page = 0; page < pages; page++) {
        const skip = page * 20;
        const skipPath = skip > 0 ? `/skip=${skip}` : '';
        const url = `${baseUrl}/${config}/catalog/${type}/${catId}${skipPath}.json?_nocache=${Date.now()}`;
        
        try {
            console.log(`Fetching page ${page + 1}... (${url})`);
            const res = await axios.get(url, { timeout: 30000 });
            const metas = res.data.metas || [];
            
            if (metas.length === 0) {
                console.log(`No more items on page ${page + 1}.`);
                break;
            }
            
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

                textOutput += `${(skip + i + 1).toString().padStart(3, ' ')}. ${meta.name.padEnd(50)} | Season: ${(tlBadge || 'None').padEnd(10)} | Ep: ${trBadge || 'None'} | ID: ${meta.id}\n`;
            }
        } catch (e) {
            console.error(`Error fetching page ${page + 1}:`, e.message);
            break;
        }
    }
    
    const outPath = path.join(__dirname, '..', 'simulcast_report.txt');
    fs.writeFileSync(outPath, textOutput);
    console.log(`Saved report to ${outPath}`);
    console.log(textOutput);
}

run();
