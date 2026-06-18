require('dotenv').config();
const axios = require('axios');

const TMDB_KEY = process.env.TMDB_API_KEY;
// Usiamo Re:Zero come test (TMDB ID: 65942)
const TMDB_ID = 65942; 

async function testMapping() {
    console.log("=== TEST MAPPING TMDB -> KITSU ===");

    try {
        console.log(`1. Chiedo a TMDB gli External IDs per tmdb:${TMDB_ID}...`);
        const extRes = await axios.get(`https://api.themoviedb.org/3/tv/${TMDB_ID}/external_ids`, {
            params: { api_key: TMDB_KEY }
        });
        const tvdbId = extRes.data.tvdb_id;
        console.log(`   -> Trovato TVDB ID: ${tvdbId}`);

        if (!tvdbId) {
            console.log("   Nessun TVDB ID, mapping fallito.");
            return;
        }

        console.log(`2. Chiedo a Kitsu a quale anime corrisponde thetvdb/${tvdbId}...`);
        // Testiamo varie combinazioni di externalSite per thetvdb
        const sitesToTest = ['thetvdb', 'thetvdb/season', 'thetvdb/series'];
        
        for (const site of sitesToTest) {
            try {
                const mapRes = await axios.get(`https://kitsu.io/api/edge/mappings`, {
                    params: {
                        'filter[externalSite]': site,
                        'filter[externalId]': tvdbId,
                        'include': 'item'
                    }
                });
                if (mapRes.data.data.length > 0) {
                    const mappedItem = mapRes.data.data[0];
                    console.log(`   -> SUCCESSO con site '${site}'! Mappatura trovata:`);
                    // Per ottenere l'ID di Kitsu (l'anime a cui punta)
                    const rel = mappedItem.relationships.item.data;
                    console.log(`      Kitsu ID: ${rel.id} (Tipo: ${rel.type})`);
                    return; // Usciamo dal loop se troviamo un risultato
                } else {
                    console.log(`   -> Nessun risultato per site '${site}'`);
                }
            } catch (e) {
                console.log(`   -> Errore per site '${site}': ${e.message}`);
            }
        }
    } catch (e) {
        console.error("Errore generale:", e.message);
    }
}

testMapping();
