const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { MongoClient } = require('mongodb');

async function runCheck() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('ERRORE: MONGODB_URI non trovata nel file .env');
        process.exit(1);
    }

    let client;
    try {
        client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
        await client.connect();
        console.log('CONNESSO: Connessione a MongoDB Atlas riuscita.');
    } catch (err) {
        // Non stampare URI o credenziali
        const sanitizedMsg = err.message ? err.message.replace(/mongodb(\+srv)?:\/\/[^@]+@/, 'mongodb://<REDACTED>@') : 'Errore sconosciuto';
        console.error(`ERRORE_CONNESSIONE: ${err.name} - ${sanitizedMsg}`);
        if (err.code) console.error(`CODE: ${err.code}`);
        process.exit(1);
    }

    try {
        const db = client.db(); // Default db from URI
        const dbName = db.databaseName;
        console.log(`DATABASE_NAME: ${dbName}`);

        // 1. listCollections
        const collections = await db.listCollections().toArray();
        const collectionNames = collections.map(c => c.name);
        console.log('COLLECTIONS_FOUND:', JSON.stringify(collectionNames));

        const getColl = (name) => {
            const found = collectionNames.find(c => c.toLowerCase() === name.toLowerCase());
            return found ? db.collection(found) : null;
        };

        // 2. tmdbscoringdata
        console.log('\n--- TMDBSCORINGDATA ---');
        const tmdbColl = getColl('tmdbscoringdatas') || getColl('tmdbscoringdata');
        if (tmdbColl) {
            const count = await tmdbColl.countDocuments({});
            console.log(`tmdbscoringdata_name: ${tmdbColl.collectionName}`);
            console.log(`tmdbscoringdata_count: ${count}`);
            const sample = await tmdbColl.findOne({});
            if (sample) {
                console.log(`tmdbscoringdata_sample_keys:`, Object.keys(sample));
            } else {
                console.log('tmdbscoringdata_sample: NULL (nessun documento)');
            }
        } else {
            console.log('tmdbscoringdata_collection: NON TROVATA');
        }

        // 3. tasteprofiles
        console.log('\n--- TASTEPROFILES ---');
        const tasteColl = getColl('tasteprofiles') || getColl('tasteprofile');
        if (tasteColl) {
            const count = await tasteColl.countDocuments({});
            console.log(`tasteprofiles_name: ${tasteColl.collectionName}`);
            console.log(`tasteprofiles_count: ${count}`);
            
            // Sample document
            const samples = await tasteColl.aggregate([{ $sample: { size: 1 } }]).toArray();
            const sample = samples[0];
            if (sample) {
                const cv = sample.compiledVectors || {};
                const vStatic = cv.V_static || sample.V_static;
                const vActive = cv.V_active || sample.V_active;
                const vFinal = cv.V_final || sample.V_final;

                const getVecInfo = (v) => {
                    if (!v) return 'ASSENTE';
                    if (typeof v === 'object') {
                        const keysCount = Object.keys(v).length;
                        return `PRESENTE (oggeto con ${keysCount} chiavi)`;
                    }
                    return `PRESENTE (tipo: ${typeof v})`;
                };

                console.log(`tasteprofile_sample_summary:`, {
                    hasCompiledVectors: Boolean(sample.compiledVectors),
                    compiledVectorsKeys: sample.compiledVectors ? Object.keys(sample.compiledVectors) : [],
                    V_static: getVecInfo(vStatic),
                    V_active: getVecInfo(vActive),
                    V_final: getVecInfo(vFinal),
                    syncStatusPresent: 'syncStatus' in sample,
                    syncStatusType: typeof sample.syncStatus,
                    lastUpdatedPresent: 'lastUpdated' in sample,
                    updatedAtPresent: 'updatedAt' in sample,
                    allTopLevelKeys: Object.keys(sample).filter(k => !['_id', 'userId', 'userHandle', 'email', 'name', 'password'].includes(k))
                });
            } else {
                console.log('tasteprofile_sample: NULL (nessun documento)');
            }
        } else {
            console.log('tasteprofiles_collection: NON TROVATA');
        }

        // 4. watchhistories
        console.log('\n--- WATCHHISTORIES ---');
        const watchColl = getColl('watchhistories') || getColl('watchhistory');
        if (watchColl) {
            const count = await watchColl.countDocuments({});
            console.log(`watchhistories_name: ${watchColl.collectionName}`);
            console.log(`watchhistories_count: ${count}`);
        } else {
            console.log('watchhistories_collection: NON TROVATA');
        }

        // 5. useraccounts & addonconfigs
        console.log('\n--- USERACCOUNTS & ADDONCONFIGS ---');
        const userAccColl = getColl('useraccounts') || getColl('useraccount');
        if (userAccColl) {
            const count = await userAccColl.countDocuments({});
            console.log(`useraccounts_count: ${count}`);
        } else {
            console.log('useraccounts_collection: NON TROVATA');
        }

        const addonConfColl = getColl('addonconfigs') || getColl('addonconfig');
        if (addonConfColl) {
            const count = await addonConfColl.countDocuments({});
            console.log(`addonconfigs_count: ${count}`);
        } else {
            console.log('addonconfigs_collection: NON TROVATA');
        }

        // 6. recommendationimpressions
        console.log('\n--- RECOMMENDATIONIMPRESSIONS ---');
        const recImpColl = getColl('recommendationimpressions') || getColl('recommendationimpression');
        if (recImpColl) {
            const count = await recImpColl.countDocuments({});
            console.log(`recommendationimpressions_count: ${count}`);
            const catalogIds = await recImpColl.distinct('catalogId');
            console.log(`distinct_catalogIds:`, catalogIds.slice(0, 50));
            // Sample keys
            const sampleRec = await recImpColl.findOne({});
            if (sampleRec) {
                console.log(`recommendationimpressions_keys:`, Object.keys(sampleRec));
            }
        } else {
            console.log('recommendationimpressions_collection: NON TROVATA');
        }

        // 7. Cache collections
        console.log('\n--- CACHE COLLECTIONS ---');
        const cacheColls = collectionNames.filter(name => /cache/i.test(name));
        console.log(`cache_like_collections:`, cacheColls);
        for (const cName of cacheColls) {
            const cCount = await db.collection(cName).countDocuments({});
            console.log(`collection "${cName}" count: ${cCount}`);
            const sampleCache = await db.collection(cName).findOne({});
            if (sampleCache) {
                console.log(`collection "${cName}" sample_keys:`, Object.keys(sampleCache));
            }
        }

    } finally {
        await client.close();
        console.log('\nCONNESSIONE_CHIUSA: Client disconnesso.');
    }
}

runCheck().catch(err => {
    console.error('FATAL_ERROR:', err.message);
    process.exit(1);
});
