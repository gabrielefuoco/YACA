/** fetch-trakt-users.js — LE CRONOLOGIE DI VISIONE DEGLI UTENTI TRACT.
 *  Perche': /related e' mono-medium e le liste sono il 97% mono-medium. Ma un UTENTE guarda film E
 *  serie: la sua cronologia attraversa i medium per costruzione. E' il segnale comportamentale
 *  cross-medium, la stessa logica di MovieLens ma dove le serie esistono.
 *  Uso: USERS=400 PAGES=3 node .scratch/ml-collaborativo/fetch-trakt-users.js */
const fs = require('fs'), path = require('path');
require('dotenv').config({ quiet: true });
const CACHE = path.join(__dirname, '../../../.cache/trakt/users');
const LC = path.join(__dirname, '../../../.cache/trakt/lists');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
    const key = process.env.TRAKT_CLIENT_ID;
    fs.mkdirSync(CACHE, { recursive: true });
    const H = { 'Content-Type': 'application/json', 'trakt-api-version': '2', 'trakt-api-key': key, 'User-Agent': 'yaca-users/1.0' };
    // gli utenti li ricavo dagli autori delle liste popolari (gia' in cache)
    const autori = new Set();
    for (const f of fs.readdirSync(LC).filter(x => x.startsWith('popular-'))) {
        try {
            for (const w of JSON.parse(fs.readFileSync(path.join(LC, f), 'utf8'))) {
                const L = w.list || w;
                const u = L.user && (L.user.ids ? L.user.ids.slug : L.user);
                if (typeof u === 'string') autori.add(u);
            }
        } catch (e) {}
    }
    const lista = [...autori].slice(0, Number(process.env.USERS || 400));
    console.log(`utenti trovati nelle liste: ${autori.size} · ne uso ${lista.length}`);
    const PAGES = Number(process.env.PAGES || 3);
    let ok = 0, err = 0, nfilm = 0, nserie = 0;
    for (const u of lista) {
        for (const [tipo, ep] of [['movie', 'watched/movies'], ['show', 'watched/shows']]) {
            const f = path.join(CACHE, `${tipo}-${u}.json`);
            if (fs.existsSync(f)) continue;
            let voci = [];
            let rotto = false;
            for (let page = 1; page <= PAGES; page++) {
                const r = await fetch(`https://api.trakt.tv/users/${u}/${ep}?page=${page}&limit=100&extended=full`, { headers: H });
                if (r.status === 429) { console.log('RATE LIMIT: attendo 60s'); await sleep(60000); page--; continue; }
                if (r.status === 403 || r.status === 404) { rotto = true; break; }
                if (!r.ok) { err++; await sleep(300); break; }
                const arr = await r.json();
                if (!arr.length) break;
                voci = voci.concat(arr);
                await sleep(300);
            }
            if (rotto) continue;
            fs.writeFileSync(f, JSON.stringify(voci));
            if (tipo === 'movie') nfilm += voci.length; else nserie += voci.length;
            ok++;
        }
        if (ok % 100 === 0 && ok) console.log(`  ${ok} cronologie · ${nfilm} film · ${nserie} serie · ${err} errori`);
    }
    console.log(`FINE: ${ok} cronologie · ${nfilm} film · ${nserie} serie · ${err} errori`);
    process.exit(0);
})().catch(e => { console.error('ERRORE:', e.message); process.exit(1); });
