/** impressioni.js — LE IMPRESSIONI DI YACA: IL SEGNALE DELLE DECISIONI.
 *  recommendationimpressions ha catalogId, owner, tmdbId, profileId, createdAt, seenDates.
 *  Le domande: quanti utenti, che periodo, e soprattutto -- `seenDates` collega l'impressione
 *  a qualcosa che l'utente ha POI fatto? Se si', e' un click-through vero, sul dominio vero,
 *  e vale piu' di 400 curatori Trakt. */
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const { connectMongo } = require('C:/Users/gabri/APP/YACA/src/utils/mongoConnect');

const riassunto = (a, k) => a.length ? `${a.length} valori · min ${a[0]} · max ${a[a.length - 1]}` : `${k}: nessuno`;

(async () => {
    await connectMongo(process.env.MONGODB_URI, { mongoose });
    const db = mongoose.connection.db;
    const I = db.collection('recommendationimpressions');

    console.log('=== impressioni');
    const tot = await I.countDocuments();
    console.log('  documenti:', tot);
    console.log('  per owner:', JSON.stringify(await I.aggregate([{ $group: { _id: '$owner', n: { $sum: 1 } } }, { $sort: { n: -1 } }]).toArray()));
    console.log('  per catalogId:', JSON.stringify(await I.aggregate([{ $group: { _id: '$catalogId', n: { $sum: 1 } } }, { $sort: { n: -1 } }]).toArray()));
    const date = (await I.find({}, { createdAt: 1 }).sort({ createdAt: 1 }).toArray()).map(x => x.createdAt).filter(Boolean);
    console.log('  periodo:', riassunto(date.map(d => new Date(d).toISOString().slice(0, 10)), 'createdAt'));
    const senzaSeen = await I.countDocuments({ $or: [{ seenDates: { $exists: false } }, { seenDates: { $size: 0 } }, { seenDates: null }] });
    console.log('  impressioni con seenDates NON vuoto:' , tot - senzaSeen, '· vuoto:', senzaSeen);
    const conSeen = await I.find({ 'seenDates.0': { $exists: true } }).limit(3).toArray();
    console.log('  esempi con seenDates:');
    for (const d of conSeen) console.log('   ', JSON.stringify({ tmdbId: d.tmdbId, catalogId: d.catalogId, createdAt: d.createdAt, seenDates: d.seenDates }).slice(0, 300));
    const dateSeen = (await I.find({ 'seenDates.0': { $exists: true } }, { seenDates: 1 }).limit(500).toArray())
        .flatMap(x => x.seenDates || []).map(d => new Date(d).toISOString().slice(0, 10)).sort();
    console.log('  seenDates (primi 500 doc):', riassunto(dateSeen, 'seenDates'));

    console.log('');
    console.log('=== watchhistories');
    const W = db.collection('watchhistories');
    console.log('  per owner:', JSON.stringify(await W.aggregate([{ $group: { _id: '$owner', n: { $sum: 1 } } }, { $sort: { n: -1 } }]).toArray()));
    console.log('  per type:', JSON.stringify(await W.aggregate([{ $group: { _id: '$type', n: { $sum: 1 } } }]).toArray()));
    console.log('  per source:', JSON.stringify(await W.aggregate([{ $group: { _id: '$source', n: { $sum: 1 } } }]).toArray()));
    const w1 = await W.findOne({});
    console.log('  esempio:', JSON.stringify({ owner: w1.owner, tmdbId: w1.tmdbId, type: w1.type, source: w1.source, lastWatchedAt: w1.lastWatchedAt, signals: w1.signals }).slice(0, 400));

    console.log('');
    console.log('=== userlibraryitems');
    const L = db.collection('userlibraryitems');
    console.log('  per addonUuid:', JSON.stringify(await L.aggregate([{ $group: { _id: '$addonUuid', n: { $sum: 1 } } }, { $sort: { n: -1 } }]).toArray()));
    console.log('  removed true/false:', await L.countDocuments({ removed: true }), '/', await L.countDocuments({ removed: { $ne: true } }));
    const s = await L.aggregate([{ $group: { _id: '$state', n: { $sum: 1 } } }]).toArray();
    console.log('  per state:', JSON.stringify(s).slice(0, 400));

    await mongoose.disconnect();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
