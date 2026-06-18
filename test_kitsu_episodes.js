const axios = require('axios');

async function runTest() {
    console.log("=== TEST KITSU EPISODES ===");
    try {
        const response = await axios.get('https://kitsu.io/api/edge/episodes', {
            params: {
                'sort': '-createdAt', // Ultimi episodi aggiunti al DB
                'page[limit]': 10,
                'include': 'media' // Includi l'anime associato
            }
        });
        
        const episodes = response.data.data;
        const included = response.data.included || [];

        episodes.forEach((ep, i) => {
            const attrs = ep.attributes;
            // Trova l'anime corrispondente negli included
            const relMedia = ep.relationships?.media?.data;
            let animeTitle = "Sconosciuto";
            if (relMedia) {
                const mediaItem = included.find(inc => inc.id === relMedia.id && inc.type === relMedia.type);
                if (mediaItem) animeTitle = mediaItem.attributes.canonicalTitle;
            }

            console.log(`[${i+1}] Anime: ${animeTitle} | Ep ${attrs.number} (Aired: ${attrs.airdate}, CreatedAt: ${attrs.createdAt})`);
        });
    } catch (e) {
        console.error("Errore query Kitsu Episodes:", e.message);
    }
}

runTest();
