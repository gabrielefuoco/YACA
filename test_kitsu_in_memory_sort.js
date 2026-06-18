const axios = require('axios');

// Kitsu fetcher helper
async function fetchKitsuCatalog(params) {
    const response = await axios.get('https://kitsu.io/api/edge/anime', {
        params: {
            ...params,
            'page[limit]': 15 // Limitiamo a 15 per il test
        }
    });
    return response.data.data;
}

// Prende l'ultimo episodio andato in onda
async function fetchLatestEpisodeDate(kitsuId) {
    try {
        const response = await axios.get(`https://kitsu.io/api/edge/anime/${kitsuId}/episodes`, {
            params: {
                'sort': '-number', // Ordina per numero decrescente (ultimi episodi)
                'page[limit]': 5
            }
        });
        
        const episodes = response.data.data;
        if (!episodes || episodes.length === 0) return null;

        const now = new Date();
        // Cerca il primo episodio che ha una airdate ed è nel passato o presente
        for (const ep of episodes) {
            if (ep.attributes.airdate) {
                const airDate = new Date(ep.attributes.airdate);
                if (airDate <= now) {
                    return airDate;
                }
            }
        }
        return null;
    } catch (e) {
        return null;
    }
}

async function runTest() {
    console.log("=== TEST KITSU: ORDINAMENTO IN MEMORIA ===");
    console.log("1. Recupero 15 Anime in corso (Simulcast)...");
    
    // Passo 1: Prendiamo gli anime attualmente in onda (stagione corrente)
    const animes = await fetchKitsuCatalog({
        'filter[status]': 'current',
        'sort': 'popularityRank'
    });

    console.log(`Trovati ${animes.length} anime. Controllo le date degli ultimi episodi...`);

    // Passo 2: Recuperiamo l'ultimo episodio per ciascuno
    const results = [];
    for (const anime of animes) {
        const latestAirDate = await fetchLatestEpisodeDate(anime.id);
        results.push({
            title: anime.attributes.canonicalTitle,
            id: anime.id,
            latestAirDate: latestAirDate
        });
    }

    // Passo 3: Ordiniamo i risultati basandoci sulla data dell'ultimo episodio
    results.sort((a, b) => {
        if (!a.latestAirDate) return 1; // Mettili in fondo se non hanno date
        if (!b.latestAirDate) return -1;
        return b.latestAirDate - a.latestAirDate; // Ordine decrescente (Più recente prima)
    });

    // Stampa risultati
    console.log("\n=== RISULTATO FINALE (Simulcast Reale) ===");
    results.forEach((r, i) => {
        const dateStr = r.latestAirDate ? r.latestAirDate.toISOString().split('T')[0] : 'Sconosciuta';
        console.log(`[${i+1}] ${r.title} (Ultimo episodio: ${dateStr})`);
    });
}

runTest();
