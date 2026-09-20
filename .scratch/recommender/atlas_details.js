const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { MongoClient } = require('mongodb');

async function checkDetails() {
    const uri = process.env.MONGODB_URI;
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
    await client.connect();

    try {
        const db = client.db();

        // tmdbscoringdatas dates
        const tmdbColl = db.collection('tmdbscoringdatas');
        const oldestTmdb = await tmdbColl.find({}, { projection: { createdAt: 1, updatedAt: 1 } }).sort({ createdAt: 1 }).limit(1).toArray();
        const newestTmdb = await tmdbColl.find({}, { projection: { createdAt: 1, updatedAt: 1 } }).sort({ updatedAt: -1 }).limit(1).toArray();
        console.log('TMDB_SCORING_DATES:', {
            oldestCreatedAt: oldestTmdb[0]?.createdAt,
            newestUpdatedAt: newestTmdb[0]?.updatedAt,
            newestCreatedAt: newestTmdb[0]?.createdAt
        });

        // watchhistories dates & count
        const watchColl = db.collection('watchhistories');
        const oldestWatch = await watchColl.find({}, { projection: { createdAt: 1, updatedAt: 1 } }).sort({ createdAt: 1 }).limit(1).toArray();
        const newestWatch = await watchColl.find({}, { projection: { createdAt: 1, updatedAt: 1 } }).sort({ updatedAt: -1 }).limit(1).toArray();
        console.log('WATCH_HISTORIES_DATES:', {
            count: await watchColl.countDocuments({}),
            oldestCreatedAt: oldestWatch[0]?.createdAt,
            newestUpdatedAt: newestWatch[0]?.updatedAt
        });

        // tasteprofiles summary across all docs
        const tasteColl = db.collection('tasteprofiles');
        const allProfiles = await tasteColl.find({}, { projection: {
            'compiledVectors.V_static': 1,
            'compiledVectors.V_active': 1,
            'compiledVectors.V_final': 1,
            createdAt: 1,
            updatedAt: 1,
            lastUpdated: 1,
            onboardingCompleted: 1
        }}).toArray();

        const profileSummary = allProfiles.map((p, idx) => {
            const vStaticKeys = p.compiledVectors?.V_static ? Object.keys(p.compiledVectors.V_static).length : 0;
            const vActiveKeys = p.compiledVectors?.V_active ? Object.keys(p.compiledVectors.V_active).length : 0;
            const vFinalKeys = p.compiledVectors?.V_final ? Object.keys(p.compiledVectors.V_final).length : 0;
            return {
                idx,
                vStaticKeys,
                vActiveKeys,
                vFinalKeys,
                createdAt: p.createdAt,
                updatedAt: p.updatedAt
            };
        });
        console.log('TASTEPROFILES_BREAKDOWN (18 profili):', profileSummary);

        // recommendationimpressions stats
        const recColl = db.collection('recommendationimpressions');
        const recCatalogCounts = await recColl.aggregate([
            { $group: { _id: "$catalogId", count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]).toArray();
        console.log('REC_IMPRESSIONS_PER_CATALOG:', recCatalogCounts);

        const oldestRec = await recColl.find({}, { projection: { createdAt: 1, updatedAt: 1 } }).sort({ createdAt: 1 }).limit(1).toArray();
        const newestRec = await recColl.find({}, { projection: { createdAt: 1, updatedAt: 1 } }).sort({ updatedAt: -1 }).limit(1).toArray();
        console.log('REC_IMPRESSIONS_DATES:', {
            oldestCreatedAt: oldestRec[0]?.createdAt,
            newestUpdatedAt: newestRec[0]?.updatedAt
        });

    } finally {
        await client.close();
    }
}

checkDetails().catch(err => {
    console.error('ERROR:', err.message);
    process.exit(1);
});
