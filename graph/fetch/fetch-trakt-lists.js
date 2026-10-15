/** fetch-trakt-lists.js — LE LISTE PUBBLICHE DI TRACT.
 *  Perche': /shows/{id}/related restituisce SERIE e /movies/{id}/related restituisce FILM: il grafo
 *  dei "related" e' mono-medium e non collega mai un film a una serie. Le LISTE invece mescolano i
 *  due medium -> la co-occorrenza attraversa i medium, ed e' il segnale che manca al caso d'uso
 *  principale del prodotto (l'80% dell'uso reale e' serie).
 *  Uso: PAGES=40 node .scratch/ml-collaborativo/fetch-trakt-lists.js */
const fs = require('fs'), path = require('path');
require('dotenv').config({ quiet: true });
const CACHE = path.join(__dirname, '../../.cache/trakt/lists');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
    const key = process.env.TRAKT_CLIENT_ID;
    if (!key) throw new Error('TRAKT_CLIENT_ID mancante');
    fs.mkdirSync(CACHE, { recursive: true });
    const PAGES = Number(process.env.PAGES || 40);
    const H = { 'Content-Type': 'application/json', 'trakt-api-version': '2', 'trakt-api-key': key, 'User-Agent': 'yaca-lists/1.0' };
    let nlist = 0, nitems = 0, err = 0;
    for (let page = 1; page <= PAGES; page++) {
        const f = path.join(CACHE, `popular-${page}.json`);
        let lists;
        if (fs.existsSync(f)) lists = JSON.parse(fs.readFileSync(f, 'utf8'));
        else {
            const r = await fetch(`https://api.trakt.tv/lists/popular?page=${page}&limit=100&extended=full`, { headers: H });
            if (r.status === 429) { console.log('RATE LIMIT: attendo 60s'); await sleep(60000); page--; continue; }
            if (!r.ok) { err++; await sleep(400); continue; }
            lists = await r.json();
            fs.writeFileSync(f, JSON.stringify(lists));
            await sleep(400);
        }
        for (const W of lists) {
            const L = W.list || W;              // la lista vera sta sotto 'list' nell'involucro
            const id = L.ids && L.ids.trakt;
            if (!id) continue;
            const fi = path.join(CACHE, `items-${id}.json`);
            if (fs.existsSync(fi)) continue;
            const r2 = await fetch(`https://api.trakt.tv/lists/${id}/items?extended=full`, { headers: H });
            if (r2.status === 429) { console.log('RATE LIMIT: attendo 60s'); await sleep(60000); continue; }
            if (!r2.ok) { err++; await sleep(300); continue; }
            const items = await r2.json();
            fs.writeFileSync(fi, JSON.stringify(items));
            nitems += items.length; nlist++;
            if (nlist % 100 === 0) console.log(`  ${nlist} liste · ${nitems} voci · ${err} errori`);
            await sleep(320);
        }
    }
    console.log(`FINE: ${nlist} liste scaricate · ${nitems} voci · ${err} errori`);
    process.exit(0);
})().catch(e => { console.error('ERRORE:', e.message); process.exit(1); });
