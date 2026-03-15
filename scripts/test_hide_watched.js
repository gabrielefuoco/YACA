require('dotenv').config();
const mongoose = require('mongoose');
const { catalogHandler } = require('../src/handlers/catalogHandler');
const TasteProfile = require('../src/db/models/TasteProfile');
const UserAccount = require('../src/db/models/UserAccount');
const AddonConfig = require('../src/db/models/AddonConfig');

async function testHideWatched() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const testUserId = 'test_user_hide_watched_' + Date.now();

        // 1. Creazione utente con hideWatched: true (Two-Table Split)
        const account = await UserAccount.create({
            userId: testUserId,
            email: `${testUserId}@test.com`,
            passwordHash: 'test-hash'
        });
        await AddonConfig.findOneAndUpdate(
            { uuid: account.addonUuid },
            { $set: {
                config: { hideWatched: true, activeProfileId: 'main' },
                profiles: [{ id: 'main', name: 'Main' }]
            } },
            { upsert: true }
        );

        // 2. Simuliamo che l'utente abbia già visto alcuni film popolari
        // Prendiamo i primi 5 film che solitamente appaiono in "Popular" (es. film famosi)
        // Per il test, useremo ID fittizi o reali se conosciuti, o meglio:
        // facciamo una prima chiamata senza filtri per scoprire gli ID, poi li aggiungiamo al profilo.

        console.log('\n--- Step 1: Chiamata senza filtri (mock) ---');
        await AddonConfig.updateOne(
            { uuid: account.addonUuid },
            { $set: { 'config.hideWatched': false } }
        );

        const resNormal = await catalogHandler({
            id: 'yaca_discover_movies',
            type: 'movie',
            extra: { skip: 0 }
        }, {
            userId: testUserId,
            config: { hideWatched: false },
            apiKeys: { tmdb: process.env.TMDB_API_KEY }
        });

        const normalIds = resNormal.metas.map(m => m.id.replace('tmdb:', ''));
        console.log(`Primi 5 ID normali: ${normalIds.slice(0, 5).join(', ')}`);

        // 3. Aggiungiamo i primi 5 film alla history
        await TasteProfile.create({
            owner: testUserId,
            context: 'global',
            processedTraktIds: normalIds.slice(0, 5) // Nascondiamo i primi 5
        });

        // 4. Chiamata con hideWatched: true
        console.log('\n--- Step 2: Chiamata con hideWatched: true ---');
        const resFiltered = await catalogHandler({
            id: 'yaca_discover_movies',
            type: 'movie',
            extra: { skip: 0 }
        }, {
            userId: testUserId,
            config: { hideWatched: true },
            apiKeys: { tmdb: process.env.TMDB_API_KEY }
        });

        const filteredIds = resFiltered.metas.map(m => m.id.replace('tmdb:', ''));
        console.log(`Primi 5 ID filtrati: ${filteredIds.slice(0, 5).join(', ')}`);

        // Verifica
        const intersection = normalIds.slice(0, 5).filter(id => filteredIds.includes(id));
        if (intersection.length === 0) {
            console.log('✅ TEST SUPERATO: I primi 5 film sono stati nascosti.');
        } else {
            console.log('❌ TEST FALLITO: Alcuni film visti sono ancora presenti:', intersection);
        }

        // Verifica filling: la lista deve avere comunque molti elementi (almeno > 15 se TMDB ne ha dati abbastanza)
        console.log(`Numero elementi restituiti: ${resFiltered.metas.length}`);
        if (resFiltered.metas.length >= resNormal.metas.length) {
            console.log('✅ TEST SUPERATO: La pagina è stata riempita correttamente.');
        } else {
            console.log('⚠️ ATTENZIONE: La pagina è più corta del normale (Filling parziale o fine catalogo).');
        }

        // Cleanup (Two-Table Split)
        await UserAccount.deleteOne({ userId: testUserId });
        await AddonConfig.deleteOne({ uuid: account.addonUuid });
        await TasteProfile.deleteOne({ owner: testUserId });
        console.log('\nCleanup completato.');

    } catch (err) {
        console.error('Errore durante il test:', err);
    } finally {
        await mongoose.disconnect();
    }
}

testHideWatched();
