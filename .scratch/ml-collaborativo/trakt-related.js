require('dotenv').config({ quiet: true });
const https = require('https'); const fs = require('fs');
const H = { 'Content-Type': 'application/json', 'trakt-api-version': '2', 'trakt-api-key': process.env.TRAKT_CLIENT_ID, 'User-Agent': 'YACA-graph/1.0' };
const get = url => new Promise((res, rej) => https.get(url, { headers: H }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d || '[]')); } catch (e) { rej(new Error('parse')); } }); }).on('error', rej));
const TITLES = [['show', 1399, 'Game of Thrones'], ['movie', 1495, 'Le crociate'], ['show', 1396, 'Breaking Bad'],
    ['movie', 238, 'Il padrino'], ['show', 82856, 'The Mandalorian'], ['movie', 11, 'Star Wars'],
    ['show', 1429, 'Attack on Titan'], ['movie', 372058, 'Your Name'], ['show', 100088, 'The Last of Us'],
    ['movie', 72190, 'World War Z']];
(async () => {
    const out = {};
    for (const [type, id, name] of TITLES) {
        try {
            const s = await get(`https://api.trakt.tv/search/tmdb/${id}?type=${type}`);
            if (!s || !s.length) { console.log(`${name}: non trovato`); continue; }
            const tr = s[0][type].ids.trakt;
            const rel = await get(`https://api.trakt.tv/${type}s/${tr}/related?limit=10`);
            out[name] = rel.map(x => ({ title: x.title, year: x.year }));
            console.log(`\n${name} (${type}) -> ${rel.length} correlati:`);
            for (const r of rel.slice(0, 6)) console.log(`   - ${r.title} (${r.year})`);
        } catch (e) { console.log(`${name}: errore ${e.message}`); }
        await new Promise(r => setTimeout(r, 400));
    }
    fs.writeFileSync('.cache/movielens/trakt-related.json', JSON.stringify(out, null, 1));
    console.log('\nsalvato in .cache/movielens/trakt-related.json');
})();
