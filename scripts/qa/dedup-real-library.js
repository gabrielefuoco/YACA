/**
 * Pulizia una tantum della libreria utente reale (driver MongoDB grezzo).
 *
 * Contesto: nella collection convivono due generazioni di documenti
 *   - moderni: `_id` ObjectId + `itemId` valorizzato
 *   - legacy : `_id` STRINGA (es. "kitsu:142") + `itemId` assente
 * Lo schema mongoose non dichiara `_id`, quindi lo assume ObjectId: leggendo i documenti
 * legacy produce valori incoerenti e le scritture vengono silenziosamente perse.
 * Per questo la manutenzione dati passa dalla collection grezza.
 *
 * Cosa fa:
 *  1. backup integrale della libreria (file JSON locale)
 *  2. per ogni chiave (itemId, oppure _id per i legacy) sceglie il documento da tenere
 *     con la stessa politica del codice: NON rimosso → mappato → più recente
 *  3. elimina i duplicati e assegna `itemId = _id` ai documenti legacy che restano
 *  4. verifica (nessun itemId mancante, nessuna chiave doppia) e crea l'indice unico
 *
 * Uso: node scripts/qa/dedup-real-library.js [--apply]
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const ADDON_UUID = 'ff7084d8-904b-42d9-91f5-ea2b4ae37590';
const APPLY = process.argv.includes('--apply');

const rank = (d) => [
    d.removed ? 1 : 0,                 // prima i NON rimossi
    d.mapped ? 0 : 1,                  // poi i mappati
    -(new Date(d._mtime || 0)).getTime() // poi i più recenti
];
const better = (a, b) => {
    const ra = rank(a), rb = rank(b);
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] < rb[i] ? a : b;
    return a;
};

(async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    const col = mongoose.connection.collection('userlibraryitems');

    const docs = await col.find({ addonUuid: ADDON_UUID }).toArray();
    const legacy = docs.filter(d => typeof d._id === 'string');
    const modern = docs.filter(d => typeof d._id !== 'string');
    console.log(`Documenti: ${docs.length} (legacy a _id stringa: ${legacy.length} | moderni: ${modern.length})`);
    console.log(`Legacy senza itemId: ${legacy.filter(d => !d.itemId).length} | moderni con itemId: ${modern.filter(d => d.itemId).length}`);

    const backupDir = path.resolve(__dirname, '..', '..', '.cache', 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupDir, `userlibraryitems-${ADDON_UUID}-${stamp}.json`);
    fs.writeFileSync(backupFile, JSON.stringify(docs, null, 1));
    console.log(`Backup: ${backupFile} (${(fs.statSync(backupFile).size / 1024 / 1024).toFixed(1)} MB)`);

    // Raggruppa per chiave logica: itemId se presente, altrimenti _id (stringa) del legacy
    const groups = new Map();
    for (const d of docs) {
        const key = String(d.itemId || d._id).trim();
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(d);
    }

    const toDelete = [];
    const toAssignItemId = [];
    let dupGroups = 0;
    for (const [key, list] of groups) {
        if (list.length > 1) {
            dupGroups++;
            let keep = list[0];
            for (const d of list.slice(1)) keep = better(keep, d);
            for (const d of list) if (d !== keep) toDelete.push(d._id);
            if (!keep.itemId) toAssignItemId.push(keep._id);
        } else if (!list[0].itemId) {
            toAssignItemId.push(list[0]._id);
        }
    }

    const deletedActive = toDelete
        .map(id => docs.find(d => d._id === id))
        .filter(d => d && !d.removed).length;
    console.log(`Chiavi duplicate: ${dupGroups} → documenti da eliminare: ${toDelete.length} (di cui attivi: ${deletedActive})`);
    console.log(`Documenti legacy a cui assegnare itemId: ${toAssignItemId.length}`);

    if (!APPLY) {
        console.log('DRY-RUN: nessuna modifica. Rilancia con --apply.');
        await mongoose.disconnect();
        return;
    }

    if (toDelete.length > 0) {
        const r = await col.deleteMany({ _id: { $in: toDelete } });
        console.log(`Eliminati: ${r.deletedCount}`);
    }
    if (toAssignItemId.length > 0) {
        const r = await col.updateMany(
            { _id: { $in: toAssignItemId } },
            [{ $set: { itemId: { $toString: '$_id' } } }]
        );
        console.log(`itemId assegnati: ${r.modifiedCount}`);
    }

    const after = await col.countDocuments({ addonUuid: ADDON_UUID });
    const missing = await col.countDocuments({ addonUuid: ADDON_UUID, $or: [{ itemId: { $exists: false } }, { itemId: null }] });
    const dupAfter = await col.aggregate([
        { $match: { addonUuid: ADDON_UUID } },
        { $group: { _id: '$itemId', n: { $sum: 1 } } },
        { $match: { n: { $gt: 1 } } }, { $count: 'g' }
    ]).toArray();
    console.log(`Dopo: ${after} documenti | itemId mancanti: ${missing} | chiavi ancora doppie: ${dupAfter[0]?.g || 0}`);

    try {
        await col.createIndex({ addonUuid: 1, itemId: 1 }, { unique: true, name: 'addonUuid_1_itemId_1' });
        console.log('Indice unico {addonUuid, itemId}: CREATO');
    } catch (e) {
        console.log('Indice unico non creabile:', e.message.slice(0, 140));
    }
    console.log('Indici presenti:', (await col.listIndexes().toArray()).map(i => i.name).join(', '));

    await mongoose.disconnect();
})().catch(e => { console.error('ERRORE:', e.message); process.exit(1); });
