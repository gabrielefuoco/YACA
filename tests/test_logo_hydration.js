const { getImageKitUrl } = require('../src/utils/imageProcessor');
const { catalogHandler } = require('../src/handlers/catalogHandler');
const TmdbScoringData = require('../src/models/TmdbScoringData');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Carica variabili d'ambiente
dotenv.config();

async function verifyLogoHydration() {
    console.log('--- Test Verificata Idratazione Loghi ---');

    const mockItem = {
        id: 'tmdb:550',
        type: 'movie',
        name: 'Fight Club',
        poster: 'https://image.tmdb.org/t/p/w500/pB8BM79vS6vMvP9I0O67N3nrJ3i.jpg',
        background: 'https://image.tmdb.org/t/p/original/hZk9YQjSwwvS9nZz9m9m9m9m9m.jpg'
    };

    const mockScoringDoc = {
        tmdbId: 550,
        type: 'movie',
        logo_path: '/8u07SU7p2I65p160160160160.png' // Mock logo path
    };

    console.log('1. Mocking Database...');
    // In un test reale useremmo un DB di test, qui verifichiamo la logica di idratazione
    // iniettando i dati direttamente se possibile o simulando la chiamata.
    
    // Per testare catalogHandler.finalizeCatalog (che chiama hydrateResultsFromLocalDetailsCache):
    const { metas } = await require('../src/handlers/catalogHandler').catalogHandler({
        id: 'yaca_true_blend_movies', // Uno dei cataloghi landscape
        type: 'movie',
        skip: 0
    }, {
        apiKeys: { tmdb: process.env.TMDB_API_KEY, imagekit: 'test_ik' },
        config: { landscapeEnabled: true }
    });

    console.log('2. Verificando URL generato...');
    const fightClub = metas.find(m => m.name === 'Fight Club');
    if (fightClub) {
        console.log('Poster URL:', fightClub.poster);
        if (fightClub.poster.includes('i-base64')) {
            console.log('SUCCESS: Logo overlay (base64) trovato!');
        } else {
            console.log('FAILED: Logo overlay non trovato.');
        }
    } else {
        console.log('Titolo non trovato nel catalogo (normale se non in cache).');
    }

    console.log('Test completato.');
}

// Nota: require('../src/handlers/catalogHandler') richiede una connessione Mongo attiva.
// Questo script è inteso come debug manuale o traccia.
console.log('Eseguire questo test richiede un ambiente configurato con MongoDB.');
