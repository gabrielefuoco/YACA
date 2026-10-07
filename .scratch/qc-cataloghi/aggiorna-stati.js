/**
 * aggiorna-stati.js — riallinea la riga `**Stato**` dei ticket a quello che e' successo davvero.
 * Idempotente: riscrive la riga per intero, non la appende.
 */
const fs = require('fs');
const path = require('path');

const STATI = {
    '01-campagna-qc-cataloghi': '`eseguito` 06/10/2026 · **Aperto**: solo 20 e 21 (il resto è chiuso; il deploy attende il motore hero)',
    '02-anime-fuori-promessa': '`chiuso` 07/10/2026 · 15 cataloghi, anime 4-79% → 0-2% in 13 su 15 (commit `c2e4ce5`)',
    '03-keyword-come-promessa': '`chiuso` 07/10/2026 · coperto dai tre giri del banco keyword (17 cataloghi riscritti)',
    '04-pool-sotto-la-pagina': '`chiuso` 07/10/2026 · sotto 20: 12 → 8 · 20-59: 30 → 21 · 13 cataloghi portati a pool ≥ 60 · i 7 registi accettati corti + nuovo «I Grandi Registi» (`0127a9a`, `a356108`)',
    '05-soglie-voti-e-trash': '`chiuso` 07/10/2026 · soglie di voto alzate su oltre 20 cataloghi nei tre giri del banco; il pavimento 5.5-6.0 ha azzerato i B-movie trash dove serviva',
    '06-cataloghi-di-persona': '`chiuso` 06/10/2026 · documentari fuori e durata minima 60\' (commit `2b27480`)',
    '07-corti-e-trailer': '`chiuso` 06/10/2026 · `F.minRuntime(60)` nei percorsi hero e di persona; 23 item sotto i 40\' → 0 (commit `2b27480`)',
    '08-nome-vs-filtro': '`chiuso` 07/10/2026 · 5 cataloghi decisi con l\'utente: 2 rinominati, 1 filtrato, 1 accettato, 1 nuovo catalogo 0-3 (`5e9d0d5`)',
    '09-hero-fallback-invisibile': '`chiuso` 07/10/2026 · misurato (cold start vero 56,9%) e **deciso con l\'utente: lasciare com\'è** — vedi «Esito» in fondo',
    '10-hero-trakt-reale': '`chiuso` 07/10/2026 · percorso reale funzionante (P 88 film, P 86 serie) — vedi «Esito» in fondo',
    '11-harness-fixture-stantie': '`chiuso` 06/10/2026 · contesti rimappati, attesa 5/5 calcolata, fetch validato contro AddonConfig (commit `478b6bb`)',
    '12-rubrica-rumore': '`chiuso` 07/10/2026 · rubrica v2 con pertinenza sdoppiata; rumore misurato su due controlli: Δ medio 6,5, max 11 punti (`b707b4a`)',
    '13-solo-anime-non-filtra-i-hero': '`chiuso` 06/10/2026 · collisione di namespace risolta su store, marker, SQL e percorsi hero; 1363 film collidenti → 1 (commit `c2e4ce5`)',
    '14-banco-keyword': '`chiuso` 06/10/2026 · `scripts/qa/keyword-bench.js` costruito e usato per tre giri di misure (commit `2b27480`)',
    '15-metadati-sottili': '`chiuso` 07/10/2026 · 6 cataloghi con soglia a 50 voti (rumore a 0%) e 5 documentaristici passati a popolarità (`9a2564a`)',
    '16-trakt-builder-tdz': '`chiuso` 06/10/2026 · variabili issate prima di `buildFallback`: l\'errore è sparito dai log di produzione (commit `2b27480`)',
    '17-applicare-banco-keyword': '`chiuso` 07/10/2026 · 12 proposte applicate + 2 rinomine; secondo giro su 5 cataloghi (commit `2b27480`)',
    '18-seconda-lettura': '`chiuso` 07/10/2026 · 21 cataloghi ri-giudicati: 8 migliorati **oltre** il rumore misurato, nessuno peggiorato (`b707b4a`)',
    '19-hero-cold-start': '`chiuso` 07/10/2026 · 48 combinazioni misurate, 3 difetti e 1 scoperta (il tetto dei 15 titoli); le decisioni sono diventate i ticket 20 e 21',
    '20-segnale-cronologia': '`in corso` · assegnato (sperimentazione offline, 6 opzioni)',
    '21-motore-hero': '`in corso` · assegnato (pool a monte, flag sdoppiato, cap famiglia)'
};

const dir = '.scratch/qc-cataloghi/issues';
let fatti = 0;
for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.md'))) {
    const id = f.replace(/\.md$/, '');
    if (!STATI[id]) { console.log('senza stato:', id); continue; }
    const p = path.join(dir, f);
    const s = fs.readFileSync(p, 'utf8');
    const righe = s.split('\n');
    const i = righe.findIndex(r => r.startsWith('**Stato**'));
    if (i === -1) { console.log('riga Stato assente:', id); continue; }
    righe[i] = '**Stato**: ' + STATI[id];
    fs.writeFileSync(p, righe.join('\n'), 'utf8');
    fatti++;
}
console.log(`stati aggiornati: ${fatti}`);
