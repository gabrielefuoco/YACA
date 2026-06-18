const axios = require('axios');

async function fetchKitsu(name, params) {
    console.log(`\n=== Esecuzione Query Kitsu: ${name} ===`);
    console.log(`Parametri:`, params);
    try {
        const response = await axios.get('https://kitsu.io/api/edge/anime', {
            params: {
                ...params,
                'page[limit]': 10
            }
        });
        
        const animes = response.data.data;
        animes.forEach((anime, i) => {
            const attrs = anime.attributes;
            console.log(`[${i+1}] ${attrs.canonicalTitle} (Status: ${attrs.status}, StartDate: ${attrs.startDate}, Updated: ${attrs.updatedAt})`);
        });
    } catch (e) {
        console.error("Errore query Kitsu:", e.message);
    }
}

async function runTests() {
    console.log("=== TEST MAPPING KITSU (Fase 2) ===");

    // TEST 4: Simulcast della stagione corrente (Es. Spring 2026)
    // Questo esclude i "grandi classici" in corso come One Piece, limitandosi ai veri stagionali
    await fetchKitsu("Simulcast (Stagione: Spring 2026, Sort=Popolarità)", {
        'filter[season]': 'spring',
        'filter[seasonYear]': '2026',
        'sort': 'popularityRank' 
    });

    // TEST 5: Ultimi aggiornamenti (Ultime Uscite?)
    // Vediamo se updatedAt riflette l'uscita degli episodi
    await fetchKitsu("Simulcast (Status=Current, Sort=Aggiornamento Recente)", {
        'filter[status]': 'current',
        'sort': '-updatedAt'
    });
}

runTests();
