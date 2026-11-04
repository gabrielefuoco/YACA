/** complete-trakt-lists.js — COMPLETA le liste troncate a 100 voci.
 *
 *  Metà delle 2.000 liste popolari ha `item_count` > 100 ma in cache solo la prima pagina: la loro
 *  composizione era arbitraria. Qui si ri-scarica ogni lista DALL'INIZIO fino a `item_count`, così
 *  l'ordine delle pagine è coerente con quello che si salva (accodare pagine 2..N a un ordine ignoto
 *  può duplicare o saltare voci).
 *
 *  Uso: MAX=30 node services/graph/fetch/complete-trakt-lists.js
 */
const fs = require('fs'), path = require('path');
require('dotenv').config({ quiet: true });
const CACHE = path.join(__dirname, '../../../.cache/trakt/lists');
const MAXPAGES = Number(process.env.MAXPAGES || 30);
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    const key = process.env.TRAKT_CLIENT_ID;
    if (!key) throw new Error('TRAKT_CLIENT_ID mancante');
    const H = { 'Content-Type': 'application/json', 'trakt-api-version': '2', 'trakt-api-key': key, 'User-Agent': 'yaca-complete/1.0' };

    // id lista -> item_count dichiarato
    const meta = new Map();
    for (const f of fs.readdirSync(CACHE).filter(x => x.startsWith('popular-'))) {
        try {
            for (const w of JSON.parse(fs.readFileSync(path.join(CACHE, f), 'utf8'))) {
                const L = w.list || w;
                const id = L.ids && L.ids.trakt;
                if (id) meta.set(id, L.item_count || 0);
            }
        } catch (e) {}
    }
    console.log(`liste nei metadati: ${meta.size}`);

    const daFare = [];
    for (const [id, count] of meta) {
        const fi = path.join(CACHE, `items-${id}.json`);
        if (!fs.existsSync(fi)) continue;
        let cur = 0;
        try { cur = JSON.parse(fs.readFileSync(fi, 'utf8')).length; } catch (e) { continue; }
        if (count > cur) daFare.push([id, count, cur]);
    }
    daFare.sort((a, b) => b[1] - a[1]);
    console.log(`liste da completare: ${daFare.length} · voci mancanti stimate: ${daFare.reduce((s, x) => s + x[1] - x[2], 0).toLocaleString()}`);

    let fatte = 0, voci = 0, err = 0;
    for (const [id, count, cur] of daFare) {
        const pagine = Math.min(MAXPAGES, Math.ceil(count / 100));
        let tutte = [];
        let rotto = false;
        for (let page = 1; page <= pagine; page++) {
            let r = null;
            for (let tent = 0; tent < 4; tent++) {
                try { r = await fetch(`https://api.trakt.tv/lists/${id}/items?page=${page}&limit=100&extended=full`, { headers: H }); break; }
                catch (e) { await sleep(3000 * (tent + 1)); }
            }
            if (!r) { err++; rotto = true; break; }          // rete: salto la lista, la riprendo al prossimo giro
            if (r.status === 429) { console.log('RATE LIMIT: attendo 60s'); await sleep(60000); page--; continue; }
            if (!r.ok) { err++; rotto = true; break; }
            const arr = await r.json();
            if (!arr.length) break;
            tutte = tutte.concat(arr);
            if (arr.length < 100) break;
            await sleep(330);
        }
        if (rotto || tutte.length <= cur) continue;      // niente di nuovo: non sovrascrivere
        fs.writeFileSync(path.join(CACHE, `items-${id}.json`), JSON.stringify(tutte));
        fatte++; voci += tutte.length - cur;
        if (fatte % 50 === 0) {
            console.log(`  ${fatte} liste completate · +${voci.toLocaleString()} voci · ${err} errori`);
        }
    }
    console.log(`FINE: ${fatte} liste completate · +${voci.toLocaleString()} voci · ${err} errori`);
    process.exit(0);
})().catch(e => { console.error('ERRORE:', e.message); process.exit(1); });
