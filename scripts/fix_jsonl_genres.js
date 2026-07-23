const fs = require('fs');
const readline = require('readline');
const path = require('path');

const TMDB_GENRES_EN_MAP = {
    28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
    99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
    27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Science Fiction',
    10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
    10759: 'Action & Adventure', 10762: 'Kids', 10763: 'News', 10764: 'Reality',
    10765: 'Sci-Fi & Fantasy', 10766: 'Soap', 10767: 'Talk', 10768: 'War & Politics'
};

const basePath = fs.existsSync('/data') 
    ? '/data/tmdb' 
    : 'c:/Users/gabri/APP/Streaming/YACA/.cache/tmdb';

async function fixJsonl(type) {
    const jsonlFile = path.join(basePath, `master_${type}.jsonl`);
    const tempFile = path.join(basePath, `master_${type}_fixed.jsonl`);
    
    if (!fs.existsSync(jsonlFile)) {
        console.log(`[Fix JSONL] File not found: ${jsonlFile}`);
        return;
    }

    console.log(`[Fix JSONL] Processing ${jsonlFile}...`);

    const readStream = fs.createReadStream(jsonlFile);
    const writeStream = fs.createWriteStream(tempFile);
    const rl = readline.createInterface({ input: readStream, crlfDelay: Infinity });

    let count = 0;
    let fixedCount = 0;

    for await (const line of rl) {
        if (!line.trim()) continue;
        try {
            const obj = JSON.parse(line);
            count++;
            
            let changed = false;
            if (obj.genres) {
                let genres = [];
                if (typeof obj.genres === 'string') {
                    genres = JSON.parse(obj.genres);
                } else if (Array.isArray(obj.genres)) {
                    genres = obj.genres;
                }
                
                const fixedGenres = genres.map(g => {
                    if (TMDB_GENRES_EN_MAP[g.id] && g.name !== TMDB_GENRES_EN_MAP[g.id]) {
                        changed = true;
                        return { id: g.id, name: TMDB_GENRES_EN_MAP[g.id] };
                    }
                    return g;
                });
                
                if (changed) {
                    obj.genres = typeof obj.genres === 'string' ? JSON.stringify(fixedGenres) : fixedGenres;
                    fixedCount++;
                }
            }
            writeStream.write(JSON.stringify(obj) + '\n');
        } catch (e) {
            console.error('[Fix JSONL] Error parsing line:', e.message);
        }
    }

    writeStream.end();
    
    await new Promise(resolve => writeStream.on('finish', resolve));
    
    fs.renameSync(tempFile, jsonlFile);
    console.log(`[Fix JSONL] Completed ${type}. Total: ${count}, Fixed: ${fixedCount}.`);
}

async function run() {
    await fixJsonl('movies');
    await fixJsonl('tv');
    console.log('[Fix JSONL] Done.');
}

run().catch(console.error);
