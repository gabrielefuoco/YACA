require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../../src/db/connection');
const axios = require('axios');
const crypto = require('crypto');
const LRUCache = require('../../src/utils/LRUCache');
const ImageCache = require('../../src/models/ImageCache');

// RAM L1 Cache (holds up to 200 images, expires in 24 hours)
const imageRamCache = new LRUCache({ max: 200, ttl: 24 * 60 * 60 * 1000 });

function getUrlHash(url) {
    return crypto.createHash('md5').update(url).digest('hex');
}

async function simulateProxy(url, fallback) {
    const urlHash = getUrlHash(url);

    console.log(`[Test] Requesting: ${url}`);

    // 1. Check RAM L1 Cache
    if (imageRamCache.has(urlHash)) {
        const cached = imageRamCache.get(urlHash);
        console.log(`  -> L1 HIT (RAM cache): contentType=${cached.contentType}, bufferLength=${cached.data.length}`);
        return;
    }

    // 2. Check MongoDB L2 Cache
    try {
        const cachedDb = await ImageCache.findOne({ urlHash });
        if (cachedDb) {
            imageRamCache.set(urlHash, { data: cachedDb.data, contentType: cachedDb.contentType });
            console.log(`  -> L2 HIT (MongoDB Cache): contentType=${cachedDb.contentType}, bufferLength=${cachedDb.data.length}`);
            return;
        }
    } catch (dbErr) {
        console.error('  -> MongoDB L2 check failed:', dbErr.message);
    }

    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    // 3. Fetch primary image (ERDB)
    try {
        console.log(`  -> Cache MISS: Fetching primary...`);
        const response = await axios({
            method: 'get',
            url: url,
            headers: headers,
            responseType: 'arraybuffer',
            timeout: 5000
        });

        const contentType = response.headers['content-type'] || 'image/jpeg';
        const buffer = Buffer.from(response.data);

        imageRamCache.set(urlHash, { data: buffer, contentType });
        await ImageCache.create({ urlHash, data: buffer, contentType });

        console.log(`  -> SUCCESS: Cached at L1 & L2 (MongoDB)`);
    } catch (err) {
        console.warn(`  -> FAILED primary (${err.message}). Trying fallback: ${fallback}`);
        
        const fallbackHash = getUrlHash(fallback);

        // 4. Check L1 for fallback
        if (imageRamCache.has(fallbackHash)) {
            const cachedFallback = imageRamCache.get(fallbackHash);
            console.log(`    -> L1 HIT fallback: contentType=${cachedFallback.contentType}, bufferLength=${cachedFallback.data.length}`);
            return;
        }

        // 5. Check L2 for fallback
        try {
            const cachedDbFallback = await ImageCache.findOne({ urlHash: fallbackHash });
            if (cachedDbFallback) {
                imageRamCache.set(fallbackHash, { data: cachedDbFallback.data, contentType: cachedDbFallback.contentType });
                console.log(`    -> L2 HIT fallback: contentType=${cachedDbFallback.contentType}, bufferLength=${cachedDbFallback.data.length}`);
                return;
            }
        } catch (dbErr) {
            console.error('    -> MongoDB fallback check failed:', dbErr.message);
        }

        // 6. Fetch fallback
        try {
            console.log(`    -> Cache MISS fallback: Fetching fallback...`);
            const fallbackResponse = await axios({
                method: 'get',
                url: fallback,
                headers: headers,
                responseType: 'arraybuffer',
                timeout: 5000
            });

            const fallbackContentType = fallbackResponse.headers['content-type'] || 'image/jpeg';
            const fallbackBuffer = Buffer.from(fallbackResponse.data);

            imageRamCache.set(fallbackHash, { data: fallbackBuffer, contentType: fallbackContentType });
            await ImageCache.create({ urlHash: fallbackHash, data: fallbackBuffer, contentType: fallbackContentType });

            console.log(`    -> SUCCESS fallback: Cached at L1 & L2 (MongoDB)`);
        } catch (fallbackErr) {
            console.error(`    -> FAILED both: ${fallbackErr.message}`);
        }
    }
}

async function run() {
    console.log("Connessione a MongoDB...");
    await connectDB();

    // Puliamo l'eventuale record di test precedente per simulare un cold start completo
    const testUrl = 'https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png';
    const fakeErdbUrl = 'https://easyratingsdb.com/invalid_config/poster/non_existent_id.jpg';

    const testHash = getUrlHash(testUrl);
    const fakeHash = getUrlHash(fakeErdbUrl);
    await ImageCache.deleteMany({ urlHash: { $in: [testHash, fakeHash] } });

    console.log("\n--- TEST 1: Cold start (Cache MISS sia L1 che L2, download reale e salvataggio) ---");
    await simulateProxy(testUrl, testUrl);

    console.log("\n--- TEST 2: L1 HIT (Servito istantaneamente da memoria RAM) ---");
    await simulateProxy(testUrl, testUrl);

    console.log("\n--- TEST 3: L2 HIT (Simula riavvio container, RAM pulita ma recupero da MongoDB) ---");
    imageRamCache.clear(); // Svuota la RAM
    await simulateProxy(testUrl, testUrl);

    console.log("\n--- TEST 4: Fallback (Immagine primaria 404, download e salvataggio del fallback) ---");
    await simulateProxy(fakeErdbUrl, testUrl);

    console.log("\nDisconnessione...");
    await mongoose.disconnect();
}

run();
