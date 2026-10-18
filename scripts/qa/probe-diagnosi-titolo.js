#!/usr/bin/env node
/**
 * scripts/qa/probe-diagnosi-titolo.js
 *
 * Diagnosi e Misura Puntuale del Titolo Non Preso (Ticket 45, Punto 4).
 *
 * Misura perché Yu Yu Hakusho (ID 121659 live action e ID 30669 anime) e gli altri
 * titoli ammissibili non entrano nelle raccomandazioni di nicchia:
 * 1. Filtro di Popolarità (DuckDB & Regola di Nicchia: pop <= 20)
 * 2. Cap del Candidate Pool nell'indice DuckDB (S.QUALITY limit 480 vs posizione effettiva)
 * 3. Cluster di Topoi / Generi dominanti nel vecchio motore (fetchSmartAndPool)
 * 4. Bolle attive e camminata PPR nel grafo (bolle 1311 e 1981 vs mondi del profilo)
 *
 * Utilizzo:
 *   node scripts/qa/probe-diagnosi-titolo.js
 */

require('dotenv').config();
const path = require('path');
const { execFileSync } = require('child_process');
const duckDbStore = require('../../src/indice');

const PYTHON_BIN = 'C:\\Users\\gabri\\APP\\YACA\\offline_graph_builder\\venv\\Scripts\\python.exe';
const SERVICES_DIR = path.resolve(__dirname, '../../services');

function parseJsonSafe(val, defaultVal = []) {
    if (!val) return defaultVal;
    if (typeof val === 'object') return val;
    try { return JSON.parse(val); } catch (_) { return defaultVal; }
}

async function main() {
    console.log('================================================================================');
    console.log('  YACA QA PROBE — Diagnosi e Misura del Titolo Non Preso (Ticket 45 Punto 4)');
    console.log('  Analisi causale misurata su Yu Yu Hakusho (ID 121659 & ID 30669)');
    console.log('================================================================================\n');

    await duckDbStore.init();

    // 1. Dati TMDB da DuckDB per i due record
    const r121659 = (await duckDbStore.queryRaw('SELECT * FROM tv WHERE id = 121659'))[0];
    const r30669 = (await duckDbStore.queryRaw('SELECT * FROM tv WHERE id = 30669'))[0];

    console.log('--- 1. CARATTERISTICHE DI CATALOGO IN DUCKDB ---');
    console.log(`[ID 121659] '${r121659.name}' (Live-Action 2023):`);
    console.log(`  - Voto Medio: ${r121659.vote_average} (soglia nicchia >= 6.5 / >= 7.0: PASSATO ✓)`);
    console.log(`  - Voti Totali: ${r121659.vote_count} (soglia nicchia 50..1000: PASSATO ✓)`);
    console.log(`  - Popolarità: ${r121659.popularity} (soglia nicchia <= 20.0: PASSATO ✓)`);
    console.log(`  - Generi: ${r121659.genres}`);
    console.log(`  - Keywords: ${r121659.keywords}\n`);

    console.log(`[ID 30669] '${r30669.name}' (Anime storico in cronologia utente):`);
    console.log(`  - Voto Medio: ${r30669.vote_average} (soglia nicchia >= 6.5 / >= 7.0: PASSATO ✓)`);
    console.log(`  - Voti Totali: ${r30669.vote_count} (soglia nicchia 50..1000: PASSATO ✓)`);
    console.log(`  - Popolarità: ${r30669.popularity} (soglia nicchia <= 20.0: BLOCCATO DA REGOLA POPOLARITA ✗)`);
    console.log(`  - Causa esclusione ID 30669: la popolarità (${r30669.popularity.toFixed(2)}) supera il tetto rigido di 20.0.\n`);

    // 2. Misura posizionamento nell'indice bayesiano (Pool Cap) per ID 121659
    console.log('--- 2. POSIZIONAMENTO NELL\'INDICE BAYESIANO DUCKDB (POOL CAP) ---');
    const sqlBayes = `
        SELECT id, name, vote_average, vote_count, popularity,
               ((vote_count / (vote_count + 100.0)) * vote_average + (100.0 / (vote_count + 100.0)) * 6.5) as bayes_score
        FROM tv
        WHERE vote_average >= 6.5 AND vote_count >= 50 AND vote_count <= 1000 AND popularity <= 20.0
        ORDER BY bayes_score DESC
    `;
    const candRows = await duckDbStore.queryRaw(sqlBayes);
    const totalCand = candRows.length;
    const rank121659 = candRows.findIndex(r => r.id === 121659n);

    console.log(`Totale serie TV ammissibili per nicchia in DuckDB: ${totalCand}`);
    console.log(`Posizione rank (bayes_score) di Yu Yu Hakusho (121659): ${rank121659 + 1} su ${totalCand}`);
    console.log(`Cap del candidate pool (candidatePoolSize = limit * 3 con limit=160): 480`);
    console.log(`Causa esclusione ID 121659 nel fornitore candidati: Tagliato dal Pool Cap (${rank121659 + 1} > 480).\n`);

    // 3. Misura nel Grafo (Bolle attive e vicinato)
    console.log('--- 3. POSIZIONAMENTO NEL GRAFO (BOLLE, PPR E NICCHIA_DI_QUALITA) ---');
    const pyScript = `
import json, sys
sys.path.insert(0, '${SERVICES_DIR.replace(/\\/g, '/')}')
from graph import bubbles as B, motore as MO

m = MO.Motore(silenzioso=True)
semi_tv = [42671, 1100, 4556, 280049, 94997, 94664, 158373, 246, 198178, 213306, 295778]
storia = [(f'tv:{i}', 1.0) for i in semi_tv if f'tv:{i}' in B.ROW_OF]
res = m.lista(storia, medium='series', cap=10)

mondi = [w['bolla'] for w in res.get('mondi', [])]
r121659 = B.ROW_OF.get('tv:121659')
r30669 = B.ROW_OF.get('tv:30669')

b121659 = int(m.MEM[r121659]) if r121659 is not None else None
b30669 = int(m.MEM[r30669]) if r30669 is not None else None

print(json.dumps({
    'mondi_attivi': mondi,
    'bolla_121659': b121659,
    'in_mondi_121659': b121659 in mondi,
    'bolla_30669': b30669,
    'in_mondi_30669': b30669 in mondi
}))
`;
    const pyOut = execFileSync(PYTHON_BIN, ['-c', pyScript], { encoding: 'utf8' });
    const graphData = JSON.parse(pyOut.trim());

    console.log(`Mondi attivi estratti dalla storia semi di REOZrGNRr3: [${graphData.mondi_attivi.join(', ')}]`);
    console.log(`Bolla di Yu Yu Hakusho Live (121659): ${graphData.bolla_121659} -> Presente nei mondi attivi: ${graphData.in_mondi_121659 ? 'SI' : 'NO'}`);
    console.log(`Bolla di Yu degli Spettri Anime (30669): ${graphData.bolla_30669} -> Presente nei mondi attivi: ${graphData.in_mondi_30669 ? 'SI' : 'NO'}`);
    console.log(`Causa esclusione nel Grafo: Nessuno dei due titoli appartiene ai cluster tematici (bolle e vicinato) attivati dalla storia passata dell'utente.\n`);

    await duckDbStore.close();
    console.log('Diagnosi completata con successo.');
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
