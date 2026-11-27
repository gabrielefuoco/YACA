/**
 * Il giro di test della ricerca: ~200 richieste reali contro il servizio in produzione.
 *
 *   node .scratch/ricerca-senza-llm/giro-ricerche.js [--url https://mate...]
 *
 * Usa `/api/preview-catalog`, che è lo stesso percorso della ricerca di Stremio ma restituisce
 * anche i `motivi` (in Stremio non c'è dove metterli). Nessuna cache: la ricerca non ne usa.
 *
 * Scrive `.scratch/ricerca-senza-llm/esiti-ricerche.json` e stampa un riepilogo per classe.
 */
const fs = require('fs');
const path = require('path');
const { CORPUS } = require('./corpus-ricerche');

const BASE = process.argv.includes('--url')
    ? process.argv[process.argv.indexOf('--url') + 1]
    : 'https://mate.hyena-alphard.ts.net';
const USCITA = path.join(__dirname, 'esiti-ricerche.json');

async function una(richiesta) {
    const inizio = Date.now();
    try {
        const res = await fetch(`${BASE}/api/preview-catalog`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ testo: richiesta.q, type: richiesta.type }),
            signal: AbortSignal.timeout(30000)
        });
        const ms = Date.now() - inizio;
        const corpo = await res.json().catch(() => ({}));
        const items = Array.isArray(corpo.items) ? corpo.items : [];
        return {
            ...richiesta,
            stato: res.status,
            ms,
            n: items.length,
            primi: items.slice(0, 4).map(i => String(i.title || i.name || '').slice(0, 40)),
            motivi: Array.isArray(corpo.motivi) ? corpo.motivi : null,
            intenti: Array.isArray(corpo.intenti) ? corpo.intenti.length : null
        };
    } catch (err) {
        return { ...richiesta, stato: 0, ms: Date.now() - inizio, n: 0, primi: [], motivi: [`errore_rete: ${err.message}`], intenti: null };
    }
}

function percentile(numeri, p) {
    if (numeri.length === 0) return 0;
    const ordinati = [...numeri].sort((a, b) => a - b);
    return ordinati[Math.min(ordinati.length - 1, Math.floor(ordinati.length * p))];
}

(async () => {
    console.log(`[giro] ${CORPUS.length} richieste su ${BASE}`);
    const esiti = [];

    for (const [indice, richiesta] of CORPUS.entries()) {
        const esito = await una(richiesta);
        esiti.push(esito);
        const segno = esito.stato === 200 ? (esito.n > 0 ? '·' : '⌀') : 'X';
        process.stdout.write(`${segno}`);
        if ((indice + 1) % 60 === 0) process.stdout.write(` ${indice + 1}/${CORPUS.length}\n`);
    }
    process.stdout.write('\n');

    fs.writeFileSync(USCITA, JSON.stringify({ base: BASE, quando: new Date().toISOString(), esiti }, null, 1));

    const perAtteso = {};
    for (const e of esiti) {
        const classe = e.atteso;
        perAtteso[classe] = perAtteso[classe] || { tot: 0, pieni: 0, vuoti: 0, errori: 0 };
        perAtteso[classe].tot += 1;
        if (e.stato !== 200) perAtteso[classe].errori += 1;
        else if (e.n > 0) perAtteso[classe].pieni += 1;
        else perAtteso[classe].vuoti += 1;
    }

    const tempi = esiti.filter(e => e.stato === 200).map(e => e.ms);
    console.log(`\n=== ${esiti.length} richieste`);
    for (const [classe, conteggi] of Object.entries(perAtteso)) {
        console.log(`  ${classe.padEnd(8)} ${conteggi.tot} · pieni ${conteggi.pieni} · vuoti ${conteggi.vuoti} · errori ${conteggi.errori}`);
    }
    console.log(`  tempi: p50 ${percentile(tempi, 0.5)} ms · p90 ${percentile(tempi, 0.9)} ms · p99 ${percentile(tempi, 0.99)} ms · max ${Math.max(...tempi)} ms`);

    const inattesi = esiti.filter(e => e.atteso === 'pieno' && e.n === 0);
    if (inattesi.length) {
        console.log(`\n--- attese piene rimaste vuote (${inattesi.length}):`);
        for (const e of inattesi) console.log(`   ${JSON.stringify(e.q).padEnd(42)} ${e.type.padEnd(7)} motivi=${JSON.stringify(e.motivi)}`);
    }
    const sbagliati = esiti.filter(e => e.atteso === 'vuoto' && e.n > 0);
    if (sbagliati.length) {
        console.log(`\n--- attese vuote che hanno trovato qualcosa (${sbagliati.length}):`);
        for (const e of sbagliati) console.log(`   ${JSON.stringify(e.q).padEnd(42)} ${e.n} titoli: ${e.primi.join(' · ')}`);
    }
    console.log(`\n[giro] esiti completi in ${USCITA}`);
    process.exit(0);
})();
