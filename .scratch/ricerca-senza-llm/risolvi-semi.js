const fs = require('fs');
const path = require('path');
process.env.DUCKDB_PATH = process.env.DUCKDB_PATH || path.resolve(__dirname, '../../.cache/tmdb/catalog.duckdb');
const PROFILI = {
  'sci-fi moderno': ['Interstellar','Inception','Arrival','Blade Runner 2049','Dune','The Martian','Gravity','Moon','Annihilation','Ex Machina','Her','Sunshine','Primer','Contact'],
  'horror': ['The Shining','The Thing','Alien','Hereditary','Midsommar','The Witch','It Follows','The Babadook','Get Out','Suspiria','Rosemary\'s Baby','The Exorcist','The Descent','[REC]'],
  'arthouse': ['Stalker','8½','Persona','Mulholland Drive','In the Mood for Love','Werckmeister Harmonies','The Mirror','Au Hasard Balthazar','The Sacrifice','Nostalghia','Andrei Rublev','The Turin Horse'],
  'commedia italiana': ['Amici miei','Il sorpasso','I soliti ignoti','Il marchese del Grillo','La grande guerra','Un americano a Roma','Il federale','Miseria e nobiltà','Totò, Peppino e la... malafemmina','Il boom'],
  'crime serie': ['Breaking Bad','True Detective','The Wire','Mindhunter','Fargo','Narcos','Peaky Blinders','The Sopranos','Better Call Saul','Sherlock']
};
(async () => {
  const indice = require('../../src/indice');
  await indice.init();
  const risolvi = async (titolo) => {
    for (const [tab, col, orig, tipo] of [['movies','title','original_title','movie'],['tv','name','original_name','tv']]) {
      const esatto = await indice.queryRaw(`SELECT id FROM ${tab} WHERE lower(${col}) = lower(?) OR lower(${orig}) = lower(?) ORDER BY vote_count DESC NULLS LAST LIMIT 1`, [titolo, titolo]).catch(() => []);
      if (esatto[0]) return { tmdbId: Number(esatto[0].id), tipo };
    }
    for (const [tab, col, orig, tipo] of [['movies','title','original_title','movie'],['tv','name','original_name','tv']]) {
      const simile = await indice.queryRaw(`SELECT id, ${col} AS nome FROM ${tab} WHERE ${col} ILIKE ? OR ${orig} ILIKE ? ORDER BY popularity DESC NULLS LAST LIMIT 1`, [`%${titolo}%`, `%${titolo}%`]).catch(() => []);
      if (simile[0]) return { tmdbId: Number(simile[0].id), tipo, approssimato: simile[0].nome };
    }
    return null;
  };
  const out = {};
  for (const [nome, titoli] of Object.entries(PROFILI)) {
    out[nome] = [];
    for (const t of titoli) {
      const r = await risolvi(t);
      if (r) out[nome].push({ ...r, titolo: t });
      else console.log(`NON TROVATO: ${t}`);
    }
  }
  fs.writeFileSync(path.join(__dirname, 'semi.json'), JSON.stringify(out, null, 1));
  for (const [k, v] of Object.entries(out)) console.log(`${k}: ${v.length} semi`);
  await indice.close?.(); process.exit(0);
})();
