const fs = require('fs');
const path = require('path');

const profiles = ['sim_prof_gen_0', 'sim_prof_gen_50', 'sim_prof_gen_100'];
const heroes = ['yaca_true_blend_movies', 'yaca_seed_network_movies', 'yaca_trakt_filtered_movies'];

for (const p of profiles) {
    console.log(`\n======================================================`);
    console.log(`PROFILO: ${p}`);
    console.log(`======================================================`);
    for (const h of heroes) {
        const file = path.join('.scratch/qc-cataloghi/runs/hero-coldstart-run/hero-enriched', p, `${h}.json`);
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        console.log(`\n--- ${h} (${data.items.length} items) ---`);
        data.items.slice(0, 25).forEach(i => {
            console.log(`${i.pos}. ${i.titolo} (${i.anno || 'n/d'}) | Rating: ${i.rating ?? 'n/d'} | Pop: ${i.popolarita ? i.popolarita.toFixed(1) : 'n/d'} | Match: ${i.match ?? 'n/d'} | Generi: ${i.generi.join(', ')}`);
        });
    }
}
