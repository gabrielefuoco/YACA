/** Esporta le cronologie reali (solo film) per il test leave-out in Python. */
const fs = require('fs'); const mongoose = require('mongoose'); require('dotenv').config();
const { connectMongo } = require('../../src/utils/mongoConnect');
(async () => {
    await connectMongo(process.env.MONGODB_URI, { mongoose });
    const db = mongoose.connection.db;
    const docs = await db.collection('watchhistories').find({ owner: 'REOZrGNRr3' }).project({ context: 1, tmdbId: 1, type: 1 }).toArray();
    const out = {};
    for (const d of docs) {
        const t = (d.type === 'tv' || d.type === 'series' || d.type === 'anime') ? 'tv' : 'movie';
        if (t !== 'movie') continue;
        (out[d.context] = out[d.context] || []).push(Number(d.tmdbId));
    }
    const path = '.cache/movielens/histories.json';
    fs.writeFileSync(path, JSON.stringify(out, null, 1));
    console.log('scritto', path, Object.entries(out).map(([k, v]) => `${k}:${v.length} film`).join(' · '));
    await mongoose.disconnect();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
