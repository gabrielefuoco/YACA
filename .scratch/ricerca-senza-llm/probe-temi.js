/**
 * Valutazione dei temi (`tema X`): dove si rompe la risoluzione dei concetti.
 *
 *   node .scratch/ricerca-senza-llm/probe-temi.js
 *
 * Ogni caso e' (parola scritta, keyword inglese attesa o null se deve restare irrisolta).
 * Le classi sono dichiarate nel nome del gruppo: lessico, plurale/singolare, refuso,
 * nome inglese diretto, parole italiane che il lessico non copre.
 */
require('dotenv').config();
const path = require('path');
process.env.DUCKDB_PATH = process.env.DUCKDB_PATH || path.resolve(__dirname, '../../.cache/tmdb/catalog.duckdb');
const indice = require('../../src/indice');
const { risolviConcetto } = require('../../src/ricerca/risolutori');


const CASI = [
  // lessico: deve gia' funzionare
  ['horror', 'horror'], ['natale', 'christmas'], ['zombie', 'zombie'], ['vampiri', 'vampire'],
  ['navi', 'ship'], ['viaggi nel tempo', 'time travel'], ['supereroi', 'superhero'],
  ['mafia', 'mafia'], ['rapina', 'heist'], ['scuola', 'school'], ['vendetta', 'revenge'],
  ['distopia', 'dystopia'], ['cyberpunk', 'cyberpunk'], ['spie', 'spy'], ['detective', 'detective'],
  ['squali', 'shark'], ['dinosauri', 'dinosaur'], ['pirati', 'pirate'], ['western', 'western'],
  ['samurai', 'samurai'], ['fantasmi', 'ghost'], ['streghe', 'witch'], ['draghi', 'dragon'],
  ['post apocalittico', 'post-apocalyptic'], ['arti marziali', 'martial arts'], ['halloween', 'halloween'],
  // plurale/singolare e forme italiane vicine
  ['nave', 'ship'], ['supereroe', 'superhero'], ['vampiro', 'vampire'], ['fantasma', 'ghost'],
  ['strega', 'witch'], ['drago', 'dragon'], ['pirata', 'pirate'], ['squalo', 'shark'],
  // refusi
  ['horor', 'horror'], ['vampir', 'vampire'], ['zombi', 'zombie'], ['superhero', 'superhero'],
  ['distopiaa', 'dystopia'], ['fantasmaa', 'ghost'],
  // temi che il lessico potrebbe non coprire
  ['survival', 'survival'], ['found footage', 'found footage'], ['slasher', 'slasher'],
  ['body horror', 'body horror'], ['spaghetti western', 'spaghetti western'],
  ['sequestro', 'kidnapping'], ['tortura', 'torture'], ['magia', 'magic'], ['resurrezione', 'resurrection'],
  ['amore', 'love'], ['amicizia', 'friendship'], ['famiglia', 'family'], ['anoressia', 'anorexia'],
  ['omofobia', 'homophobia'], ['immigrazione', 'immigration'], ['guerra', 'war'], ['olocausto', 'holocaust']
];

(async () => {
  await indice.init();
  const { keywordNameForId } = require('../../src/indice').keywordIds;

  let giusti = 0, sbagliati = 0, vuoti = 0;
  const falliti = [];

  for (const [scritto, atteso] of CASI) {
    const esito = risolviConcetto(scritto);
    const nomi = (esito || []).map(String);
    const ok = nomi.some(n => n === atteso) || (atteso === null && nomi.length === 0);
    if (ok) giusti += 1;
    else if (nomi.length === 0) vuoti += 1;
    else sbagliati += 1;
    if (!ok) falliti.push(`${JSON.stringify(scritto).padEnd(24)} → ${nomi.join(' · ') || '(nessuno)'}   [atteso: ${atteso}]`);
  }

  console.log(`\n=== ${CASI.length} temi: ${giusti} giusti, ${sbagliati} sbagliati, ${vuoti} vuoti`);
  if (falliti.length) {
    console.log('\n--- non risolti:');
    for (const f of falliti) console.log('   ', f);
  }
  await indice.close?.();
  process.exit(0);
})().catch(e => { console.error('errore:', e.message); process.exit(1); });
