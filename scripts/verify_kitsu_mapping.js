const fs = require('fs');
const axios = require('axios');

async function run() {
    console.log("Leggo catalog_state.json...");
    const data = JSON.parse(fs.readFileSync('./catalog_state.json'));
    const items = data.yaca_preset_preset_anime_simulcast.items;
    
    // Filtro via i duplicati ita_offset per avere solo gli ID base
    const uniqueItems = [];
    const seen = new Set();
    
    for (const item of items) {
        const baseId = item.id.replace('_ita_offset', '');
        if (!seen.has(baseId)) {
            seen.add(baseId);
            uniqueItems.push({ ...item, id: baseId });
        }
    }
    
    console.log(`Verifico ${uniqueItems.length} ID univoci su Kitsu...\n`);
    
    let matches = 0;
    let mismatches = 0;
    let errors = 0;

    for (const item of uniqueItems) {
        if (!item.id.startsWith('kitsu:')) {
            console.log(`[SKIP] ${item.name} non è un ID Kitsu (${item.id})`);
            continue;
        }
        
        const kitsuId = item.id.replace('kitsu:', '');
        try {
            const res = await axios.get(`https://kitsu.io/api/edge/anime/${kitsuId}`, { timeout: 10000 });
            const attrs = res.data.data.attributes;
            const kitsuTitles = [
                attrs.titles.en,
                attrs.titles.en_us,
                attrs.titles.en_jp,
                attrs.titles.ja_jp,
                attrs.canonicalTitle
            ].filter(Boolean).map(t => t.toLowerCase());

            const tmdbTitle = (item.name || '').toLowerCase();
            
            // Check if tmdbTitle is somewhat similar to any kitsu title
            let isMatch = false;
            for (const kt of kitsuTitles) {
                // If one contains the other, we consider it a match
                if (kt.includes(tmdbTitle) || tmdbTitle.includes(kt)) {
                    isMatch = true;
                    break;
                }
            }
            
            if (isMatch) {
                matches++;
                console.log(`[MATCH] TMDB: "${item.name}" <-> KITSU: "${attrs.canonicalTitle}"`);
            } else {
                mismatches++;
                console.log(`[MISMATCH?] TMDB: "${item.name}" <-> KITSU: "${attrs.canonicalTitle}" (Altri titoli Kitsu: ${kitsuTitles.join(' | ')})`);
            }

        } catch (e) {
            errors++;
            console.log(`[ERRORE] Impossibile recuperare ID ${kitsuId} per "${item.name}": ${e.message}`);
        }
        
        // Ritardo per evitare rate limit di Kitsu
        await new Promise(r => setTimeout(r, 200));
    }
    
    console.log(`\n=== RISULTATI MAPPING TMDB -> KITSU ===`);
    console.log(`Totale validati: ${matches + mismatches}`);
    console.log(`Matches confermati (Titolo Simile/Uguale): ${matches}`);
    console.log(`Mismatches apparenti (Titoli Differenti): ${mismatches}`);
    console.log(`Errori API: ${errors}`);
}

run();
