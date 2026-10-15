/** fetch-trakt-followers.js — PIU' UTENTI, VIA FOLLOWER E FOLLOWING.
 *  Perche': abbiamo preso solo gli AUTORI delle liste popolari (1.416 disponibili, 1.200 usati).
 *  I loro follower e following sono migliaia di utenti attivi, e le loro cronologie sono l'unico
 *  segnale CROSS-MEDIUM che abbiamo (`related` e' mono-medium).
 *  Due fasi: 1) scopre gli username (1 richiesta per utente); 2) scarica le loro cronologie.
 *  Uso: MAX=4000 PAGES=3 node .scratch/ml-collaborativo/fetch-trakt-followers.js */
const fs = require('fs'), path = require('path');
require('dotenv').config({ quiet: true });
const SRC = path.join(__dirname, '../../.cache/trakt/users');
const DST = path.join(__dirname, '../../.cache/trakt/users');
const LISTA = path.join(__dirname, '../../.cache/trakt/utenti-scoperti.json');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
    const key = process.env.TRAKT_CLIENT_ID;
    const H = { 'Content-Type': 'application/json', 'trakt-api-version': '2', 'trakt-api-key': key, 'User-Agent': 'yaca-foll/1.0' };
    const esistenti = new Set(fs.readdirSync(SRC).filter(f => f.startsWith('movie-')).map(f => f.slice(6, -5)));
    console.log(`utenti gia' in cache: ${esistenti.size}`);

    // --- fase 1: scopri ---
    let scoperti = new Set();
    if (fs.existsSync(LISTA)) scoperti = new Set(JSON.parse(fs.readFileSync(LISTA, 'utf8')));
    const base = [...esistenti];
    console.log(`scoperta su ${base.length} utenti (gia' scoperti: ${scoperti.size})`);
    let chiamate = 0;
    for (const u of base) {
        for (const ep of ['followers', 'following']) {
            for (let page = 1; page <= 1; page++) {
                const r = await fetch(`https://api.trakt.tv/users/${u}/${ep}?page=${page}&limit=100`, { headers: H });
                if (r.status === 429) { console.log('RATE LIMIT: attendo 60s'); await sleep(60000); page--; continue; }
                if (r.status === 403 || r.status === 404) break;
                if (!r.ok) { await sleep(300); break; }
                const arr = await r.json();
                chiamate++;
                if (!arr.length) break;
                for (const v of arr) {
                    const u2 = (v && v.user) || v || {}; const s = u2.ids ? u2.ids.slug : u2.username;
                    if (typeof s === 'string' && !esistenti.has(s)) scoperti.add(s);
                }
                await sleep(330);
            }
        }
        if (chiamate % 500 < 4 && chiamate) {
            fs.writeFileSync(LISTA, JSON.stringify([...scoperti]));
            console.log(`  ${chiamate} chiamate · ${scoperti.size} username nuovi`);
        }
    }
    fs.writeFileSync(LISTA, JSON.stringify([...scoperti]));
    console.log(`scoperta finita: ${scoperti.size} username nuovi`);

    // --- fase 2: scarica le cronologie ---
    const MAX = Number(process.env.MAX || 4000);
    const PAGES = Number(process.env.PAGES || 3);
    const lista = [...scoperti].slice(0, MAX);
    console.log(`scarico le cronologie di ${lista.length} utenti · pagine ${PAGES}`);
    let ok = 0, err = 0, nfilm = 0, nserie = 0, vuoti = 0;
    for (const u of lista) {
        let fatto = 0;
        for (const [tipo, ep] of [['movie', 'watched/movies'], ['show', 'watched/shows']]) {
            const f = path.join(DST, `${tipo}-${u}.json`);
            if (fs.existsSync(f)) { fatto++; continue; }
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
            fatto++;
            if (tipo === 'movie') { nfilm += voci.length; if (!voci.length) vuoti++; }
            else nserie += voci.length;
        }
        if (fatto === 2) ok++;
        if (ok % 200 === 0 && ok) console.log(`  ${ok} utenti fatti · ${nfilm} film · ${nserie} serie · ${vuoti} senza film · ${err} errori`);
    }
    console.log(`FINE: ${ok} utenti · ${nfilm} film · ${nserie} serie · ${err} errori`);
    process.exit(0);
})().catch(e => { console.error('ERRORE:', e.message); process.exit(1); });
