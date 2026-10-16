/** fetch-trakt-full.js — LE CRONOLOGIE SENZA IL TETTO DI 300.
 *  Perche': il 78% delle cronologie film e il 42% delle serie sono TRONCATE a 300 voci (3 pagine).
 *  E `related` e' MONO-MEDIUM: non esiste co-visione film<->serie. Quindi il ponte cross-medium
 *  — il cuore del prodotto — dipende SOLO dalle cronologie degli utenti.
 *  Scrive in `.cache/trakt/users-full/` (non tocca il banco esistente).
 *  Uso: PAGES=8 node .scratch/ml-collaborativo/fetch-trakt-full.js */
const fs = require('fs'), path = require('path');
require('dotenv').config({ quiet: true });
const SRC = path.join(__dirname, '../../.cache/trakt/users');
const DST = path.join(__dirname, '../../.cache/trakt/users-full');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
    const key = process.env.TRAKT_CLIENT_ID;
    fs.mkdirSync(DST, { recursive: true });
    const H = { 'Content-Type': 'application/json', 'trakt-api-version': '2', 'trakt-api-key': key, 'User-Agent': 'yaca-full/1.0' };
    const utenti = fs.readdirSync(SRC).filter(f => f.startsWith('movie-')).map(f => f.slice(6, -5));
    const PAGES = Number(process.env.PAGES || 8);
    console.log(`utenti da rifare: ${utenti.length} · pagine ${PAGES}`);
    let ok = 0, err = 0, nfilm = 0, nserie = 0, pieni = 0;
    for (const u of utenti) {
        for (const [tipo, ep] of [['movie', 'watched/movies'], ['show', 'watched/shows']]) {
            const f = path.join(DST, `${tipo}-${u}.json`);
            if (fs.existsSync(f)) continue;
            let voci = [], rotto = false;
            for (let page = 1; page <= PAGES; page++) {
                const r = await fetch(`https://api.trakt.tv/users/${u}/${ep}?page=${page}&limit=100&extended=full`, { headers: H });
                if (r.status === 429) { console.log('RATE LIMIT: attendo 60s'); await sleep(60000); page--; continue; }
                if (r.status === 403 || r.status === 404) { rotto = true; break; }
                if (!r.ok) { err++; await sleep(300); break; }
                const arr = await r.json();
                if (!arr.length) break;
                voci = voci.concat(arr);
                await sleep(330);
            }
            if (rotto) continue;
            fs.writeFileSync(f, JSON.stringify(voci));
            if (tipo === 'movie') { nfilm += voci.length; if (voci.length >= PAGES * 100) pieni++; }
            else nserie += voci.length;
            ok++;
        }
        if (ok % 200 === 0 && ok) console.log(`  ${ok} cronologie · ${nfilm} film · ${nserie} serie · ${pieni} ancora al tetto · ${err} errori`);
    }
    console.log(`FINE: ${ok} cronologie · ${nfilm} film · ${nserie} serie · ${pieni} ancora al tetto · ${err} errori`);
    process.exit(0);
})().catch(e => { console.error('ERRORE:', e.message); process.exit(1); });
