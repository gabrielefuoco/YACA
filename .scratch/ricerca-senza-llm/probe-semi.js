/**
 * Valutazione del seme di `simili`: quanto costa, e quante volte sbaglia.
 *
 *   node .scratch/ricerca-senza-llm/probe-semi.js
 *
 * Ogni caso e' (query scritta dall'utente, sottostringa del titolo atteso, medium). Si misura:
 * seme trovato? giusto? quanti millisecondi? Le classi di rottura sono dichiarate nel nome del
 * gruppo: articolo omesso, prefisso interno, senza spazi, accenti, plurale/singolare, refuso.
 */
require('dotenv').config();
const path = require('path');
process.env.DUCKDB_PATH = process.env.DUCKDB_PATH || path.resolve(__dirname, '../../.cache/tmdb/catalog.duckdb');
const indice = require('../../src/indice');
const { risolviTitolo } = require('../../src/ricerca/risolutori');

const CASI = [
  // nome esatto (deve continuare a funzionare)
  ['interstellar', 'Interstellar', 'movie'],
  ['batman', 'Batman', 'movie'],
  ['matrix', 'Matrix', 'movie'],
  ['alien', 'Alien', 'movie'],
  ['amici miei', 'Amici miei', 'movie'],
  ['il cavaliere oscuro', 'cavaliere oscuro', 'movie'],
  // articolo omesso (il modo piu' comune di scrivere)
  ['cavaliere oscuro', 'cavaliere oscuro', 'movie'],
  ['padrino', 'Padrino', 'movie'],
  ['signore degli anelli', 'Signore degli Anelli', 'movie'],
  ['odissea', 'Odissea', 'movie'],
  ['guerre stellari', 'Guerre stellari', 'movie'],
  ['ritorno al futuro', 'Ritorno al futuro', 'movie'],
  ['trono di spade', 'Trono di Spade', 'series'],
  ['casa di carta', 'Casa di Carta', 'series'],
  // titolo originale inglese dove il titolo italiano e' diverso
  ['dark knight', 'cavaliere oscuro', 'movie'],
  ['godfather', 'Padrino', 'movie'],
  ['back to the future', 'Ritorno al futuro', 'movie'],
  ['lord of the rings', 'Signore degli Anelli', 'movie'],
  // senza spazi / trattino
  ['spiderman', 'Spider-Man', 'movie'],
  ['spiderman no way home', 'Spider-Man: No Way Home', 'movie'],
  ['spider man', 'Spider-Man', 'movie'],
  // accenti
  ['amelie', 'Amélie', 'movie'],
  ['pokemon', 'Pokémon', 'movie'],
  // troncato (deve prendere il piu' visto)
  ['hunger game', 'Hunger Games', 'movie'],
  ['inter', 'Interstellar', 'movie'],
  ['trono', 'Trono di Spade', 'series'],
  // serie contro film
  ['breaking bad', 'Breaking Bad', 'series'],
  ['stranger things', 'Stranger Things', 'series'],
  ['il trono di spade', 'Trono di Spade', 'series'],
  // refusi veri (dichiarati fuori per scelta)
  ['interstelar', 'Interstellar', 'movie'],
  ['batmn', 'Batman', 'movie'],
  ['padrimo', 'Padrino', 'movie']
];

(async () => {
  await indice.init();
  let giusti = 0, sbagliati = 0, vuoti = 0;
  let msTot = 0;
  const falliti = [];

  for (const [q, atteso, medium] of CASI) {
    const t0 = Date.now();
    const id = await risolviTitolo(q, { type: medium === 'series' ? 'series' : 'movie', contesto: {} });
    const ms = Date.now() - t0;
    msTot += ms;

    let nome = null;
    if (id) {
      const tabella = medium === 'series' ? 'tv' : 'movies';
      const colonna = medium === 'series' ? 'name' : 'title';
      const righe = await indice.queryRaw(`SELECT ${colonna} AS nome FROM ${tabella} WHERE id = ${Number(id[0])} LIMIT 1`);
      nome = righe && righe[0] ? String(righe[0].nome) : null;
    }

    const ok = nome && nome.toLowerCase().includes(String(atteso).toLowerCase());
    if (ok) giusti += 1;
    else if (!nome) vuoti += 1;
    else sbagliati += 1;

    if (!ok) falliti.push(`${JSON.stringify(q).padEnd(28)} → ${nome || '(nessun seme)'}   [atteso: ${atteso}]`);
  }

  // A caldo: l'indice dei titoli e' gia' in RAM, si misura solo la risoluzione.
  const t1 = Date.now();
  for (const [q, , medium] of CASI) {
    await risolviTitolo(q, { type: medium === 'series' ? 'series' : 'movie', contesto: {} });
  }
  const msCaldo = (Date.now() - t1) / CASI.length;

  console.log(`\n=== ${CASI.length} casi: ${giusti} giusti, ${sbagliati} sbagliati, ${vuoti} vuoti | media ${(msTot / CASI.length).toFixed(1)} ms (a caldo ${msCaldo.toFixed(2)} ms, primo caso compreso il caricamento)`);
  if (falliti.length) {
    console.log('\n--- non risolti:');
    for (const f of falliti) console.log('   ', f);
  }
  await indice.close?.();
  process.exit(0);
})().catch(e => { console.error('errore:', e.message); process.exit(1); });
