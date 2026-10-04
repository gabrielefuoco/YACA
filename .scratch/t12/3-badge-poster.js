/**
 * .scratch/t12/3-badge-poster.js — gira DENTRO al container yaca-app (sola lettura).
 *
 *   DIR1=$(cat .scratch/t12/dir1.json) OK=$(cat .scratch/t12/films_ok.json) \
 *     ssh mate "docker exec -i -e DIR1='$DIR1' -e OK='$OK' yaca-app node" < .scratch/t12/3-badge-poster.js
 *
 * Il badge ITA non è un flag JSON ma il **nome del poster**: il formatter chiede
 * `tmdb-<tipo>-<id>_ITA.jpg` quando il badge è acceso (`src/catalog/formatters/StremioFormatter.js`,
 * `urlPosterInCache`). Quindi il file con il suffisso `_ITA` esiste se e solo se la card è uscita
 * con il badge: la misura del danno è il numero di `tmdb-movie-<id>.jpg` **senza** `_ITA`.
 *
 *   DIR1 = id dei film annotati `tv`   (badge atteso, assente)
 *   OK   = id dei film annotati `movie` (controllo: il badge deve esserci)
 */
const fs = require('fs');

const dir1 = JSON.parse(process.env.DIR1 || '[]');
const ok = JSON.parse(process.env.OK || '[]');
const files = new Set(fs.readdirSync('/data/erdb-cache'));

function check(ids) {
    const out = { ita: [], plain: [], nothing: [] };
    const has = (id, suffix) => [`jpg`, `jpeg`, `webp`].some(ext => files.has(`tmdb-movie-${id}${suffix}.${ext}`));
    for (const id of ids) {
        if (has(id, '_ITA')) out.ita.push(id);
        else if (has(id, '')) out.plain.push(id);
        else out.nothing.push(id);
    }
    return out;
}

const a = check(dir1);
const b = check(ok);
console.log(`== ${dir1.length} film annotati \`tv\` (badge atteso, assente) ==`);
console.log(`  con badge ITA: ${a.ita.length} ${JSON.stringify(a.ita)}`);
console.log(`  SENZA badge:   ${a.plain.length} ${JSON.stringify(a.plain)}`);
console.log(`  nessun poster: ${a.nothing.length} ${JSON.stringify(a.nothing)}`);
console.log(`== ${ok.length} film annotati \`movie\` (controllo) ==`);
console.log(`  con badge ITA: ${b.ita.length}`);
console.log(`  SENZA badge:   ${b.plain.length} ${JSON.stringify(b.plain)}`);
console.log(`  nessun poster: ${b.nothing.length}`);
process.stdout.write('', () => process.exit(0));
