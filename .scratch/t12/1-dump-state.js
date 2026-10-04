/**
 * .scratch/t12/1-dump-state.js — gira DENTRO al container yaca-app (sola lettura).
 *
 *   ssh mate "docker exec -i yaca-app node" < .scratch/t12/1-dump-state.js > .scratch/t12/state.json
 *
 * Raccoglie tutto quello che serve a misurare il tipo nel badge ITA:
 *   - i documenti di `anime_airing_state` (id, titoli, episodio doppiato, episodi massimi);
 *   - le righe di tv.parquet / movies.parquet per gli id tracciati (titolo, original_title, episodi, data, popolarità);
 *   - le righe di ita_annotations.jsonl.
 * Non scrive nulla: tutto esce su stdout.
 */
const fs = require('fs');
const duckdb = require('duckdb');
const { MongoClient } = require('mongodb');

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

/** Stessa regola di `services/doppiaggi-source/src/anime.js` (getDubEpisode). */
function getDubEpisode(doc) {
    if (!doc) return null;
    const dub = doc.dub || (doc.italian && doc.italian.dub && doc.italian.dub.latest);
    if (dub && Number(dub.episode) > 0) return Number(dub.episode);
    if (Array.isArray(doc.episodes)) {
        let m = 0;
        for (const ep of doc.episodes) if (ep && ep.dubIta && Number(ep.episode) > m) m = Number(ep.episode);
        if (m > 0) return m;
    }
    return null;
}

function maxEp(doc) {
    if (!doc || !Array.isArray(doc.episodes)) return 0;
    let m = 0;
    for (const ep of doc.episodes) { const n = num(ep && ep.episode); if (n !== null && n > m) m = n; }
    return m;
}

(async () => {
    const client = new MongoClient(process.env.MONGODB_URI || process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });
    await client.connect();
    const all = await client.db('yaca').collection('anime_airing_state').find({}).toArray();
    await client.close();

    const ddb = new duckdb.Database(':memory:');
    const q = (sql) => new Promise((res, rej) => ddb.all(sql, (e, r) => (e ? rej(e) : res(r))));

    const tvRows = await q(`SELECT id, name, original_name, first_air_date, number_of_episodes, popularity FROM read_parquet('/data/tmdb/tv.parquet')`);
    const mvRows = await q(`SELECT id, title, original_title, release_date, popularity FROM read_parquet('/data/tmdb/movies.parquet')`);
    const tv = new Map(tvRows.map(r => [num(r.id), { title: r.name, orig: r.original_name, date: r.first_air_date, eps: num(r.number_of_episodes), pop: num(r.popularity) }]));
    const mv = new Map(mvRows.map(r => [num(r.id), { title: r.title, orig: r.original_title, date: r.release_date, pop: num(r.popularity) }]));

    const docs = all.map(d => {
        const id = num(d._id);
        return {
            id,
            rawId: String(d._id),
            title: d.title || null,
            titles: d.titles ? { romaji: d.titles.romaji || null, english: d.titles.english || null } : null,
            srcTitles: Array.from(new Set((d.sources || []).map(s => s.title).filter(Boolean))).slice(0, 3),
            dubbed: getDubEpisode(d) !== null,
            dubEp: getDubEpisode(d),
            maxEp: maxEp(d),
            inTv: tv.has(id), inMv: mv.has(id),
            tv: tv.get(id) || null, mv: mv.get(id) || null,
            docKeys: Object.keys(d).sort()
        };
    });

    const annotations = [];
    for (const line of fs.readFileSync('/data/tmdb/ita_annotations.jsonl', 'utf8').split('\n')) {
        const s = line.trim(); if (!s) continue;
        let r; try { r = JSON.parse(s); } catch (_) { continue; }
        if (r && (r.t === 'movie' || r.t === 'tv') && (r.ita === true || r.ita === null)) {
            annotations.push({ t: r.t, id: num(r.id), ita: r.ita });
        }
    }

    const payload = JSON.stringify({
        generatedAt: new Date().toISOString(),
        parquet: { tv: tvRows.length, movies: mvRows.length },
        docs,
        annotations
    });
    process.stdout.write(payload, () => process.exit(0));
})().catch(e => { console.error('ERR', e.stack); process.exit(1); });
