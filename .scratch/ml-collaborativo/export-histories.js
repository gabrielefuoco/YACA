/** Esporta le cronologie reali separate per tipo (film e serie) per il banco in Python. */
const fs = require('fs'); const mongoose = require('mongoose'); require('dotenv').config();
const { connectMongo } = require('../../src/utils/mongoConnect');
(async () => {
    await connectMongo(process.env.MONGODB_URI, { mongoose });
    const db = mongoose.connection.db;
    const docs = await db.collection('watchhistories').find({ owner: 'REOZrGNRr3' }).project({ context: 1, tmdbId: 1, type: 1 }).toArray();
    const out = {};
    for (const d of docs) {
        const t = (d.type === 'tv' || d.type === 'series' || d.type === 'anime') ? 'tv' : 'movie';
        const ctx = out[d.context] = out[d.context] || { movie: [], tv: [] };
        ctx[t].push(Number(d.tmdbId));
    }
    fs.writeFileSync('.cache/movielens/histories.json', JSON.stringify(out, null, 1));
    for (const [k, v] of Object.entries(out)) console.log(`  ${k}: ${v.movie.length} film · ${v.tv.length} serie`);
    await mongoose.disconnect();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
