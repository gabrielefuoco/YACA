const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const needle = require('needle');

const TMDB_KEY = process.env.TMDB_KEY;
const TMDB_ENDPOINT = 'https://api.themoviedb.org/3';

const manifest = {
    id: 'org.stremio.tmdb.tutti.final',
    version: '1.0.1',
    name: 'Addon Tutti',
    description: 'Catalogo ordinato per popolarità (100 items per volta)',
    resources: ['catalog'],
    types: ['Tutti'],
    catalogs: [
        {
            id: 'tmdb_film',
            type: 'Tutti',
            name: 'Film Tutti',
            extra: [{ name: 'skip', isRequired: false }]
        },
        {
            id: 'tmdb_serie',
            type: 'Tutti',
            name: 'Serie Tutti',
            extra: [{ name: 'skip', isRequired: false }]
        }
    ],
    idPrefixes: ['tmdb:']
};

const builder = new addonBuilder(manifest);

builder.defineCatalogHandler(async (args) => {
    // 1. Gestione Paginazione Avanzata
    const skip = args.extra.skip ? parseInt(args.extra.skip) : 0;
    const pageSizeTMDB = 20;
    const pagesToFetch = 5; // Scarichiamo 5 pagine alla volta (100 items)
    
    // Calcolo della pagina iniziale di TMDB
    const startPage = Math.floor(skip / pageSizeTMDB) + 1;

    let tmdbPath, itemType;
    
    // 2. Determina il tipo in base all'ID del catalogo
    if (args.id === 'tmdb_serie') {
        tmdbPath = '/discover/tv';
        itemType = 'series';
    } else {
        tmdbPath = '/discover/movie';
        itemType = 'movie';
    }
    
    // 3. Creazione delle richieste parallele
    const promises = [];
    
    for (let i = 0; i < pagesToFetch; i++) {
        const page = startPage + i;
        const url = `${TMDB_ENDPOINT}${tmdbPath}?api_key=${TMDB_KEY}&sort_by=popularity.desc&language=it-IT&page=${page}`;
        promises.push(needle('get', url));
    }

    try {
        // Eseguiamo tutte le richieste insieme
        const responses = await Promise.all(promises);
        
        let metas = [];
        
        // 4. Elaborazione e unione dei risultati
        responses.forEach(response => {
            if (response.body && response.body.results) {
                const pageMetas = response.body.results.map(item => ({
                    id: `tmdb:${item.id}`,
                    type: itemType,
                    name: item.title || item.name,
                    poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
                    releaseInfo: (item.release_date || item.first_air_date || '').substring(0, 4),
                    posterShape: 'poster'
                }));
                
                metas = metas.concat(pageMetas);
            }
        });
        
        const cleanMetas = metas.filter(m => m.poster);

        return { 
            metas: cleanMetas, // <--- La virgola qui era il problema probabile
            cacheMaxAge: 3600 
        };

    } catch (err) {
        console.error("Errore nel fetch TMDB:", err);
        return { metas: [] };
    }
});

const port = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port });