#!/usr/bin/env node
/**
 * scripts/repair-dna-vectors.js
 *
 * Rimuove i pesi delle persone (`a:` cast, `d:` crew) dai vettori DNA già salvati
 * in `tasteprofiles.compiledVectors` e rinormalizza i vettori rimasti a 100.
 *
 * Le persone non devono influenzare il DNA: l'estrazione non le produce più e le
 * letture le scartano già (`sanitizeDnaVector`), ma i documenti salvati prima di
 * questa scelta le conservano ancora. Qui si allinea l'archivio.
 *
 * Uso:
 *   node scripts/repair-dna-vectors.js [--apply] [--owner <userId>]
 *
 * Senza `--apply` è un dry-run.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { sanitizeDnaVector } = require('../src/data/keywordIds');

function parseArgs(argv) {
    const args = { apply: false, owner: null };
    for (let i = 0; i < argv.length; i += 1) {
        if (argv[i] === '--apply') args.apply = true;
        else if (argv[i] === '--owner') args.owner = argv[++i];
        else if (argv[i] === '--help' || argv[i] === '-h') args.help = true;
    }
    return args;
}

const isPersonKey = (key) => typeof key === 'string' && (key.startsWith('a:') || key.startsWith('d:'));

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
        console.log(require('fs').readFileSync(__filename, 'utf8').split('*/')[0]);
        return;
    }

    await mongoose.connect(process.env.MONGODB_URI);
    const filter = args.owner ? { owner: args.owner } : {};
    const profiles = await mongoose.connection.collection('tasteprofiles').find(filter).toArray();

    console.log(`Profili DNA: ${profiles.length}${args.owner ? ` (owner ${args.owner})` : ''}`);
    console.log(`Modalità: ${args.apply ? 'APPLY' : 'DRY-RUN'}\n`);

    const updates = [];
    for (const profile of profiles) {
        const vectors = profile.compiledVectors || {};
        const changed = {};
        let personKeys = 0;

        for (const [name, vector] of Object.entries(vectors)) {
            if (!vector || typeof vector !== 'object' || Array.isArray(vector)) continue;
            const keys = Object.keys(vector);
            const persons = keys.filter(isPersonKey).length;
            if (persons === 0) continue;
            personKeys += persons;
            changed[name] = { before: keys.length, after: sanitizeDnaVector(vector) };
        }

        if (Object.keys(changed).length > 0) {
            updates.push({ id: profile._id, owner: profile.owner, context: profile.context, changed, personKeys });
        }
    }

    console.log(`Profili con pesi persona: ${updates.length}`);
    for (const update of updates) {
        const detail = Object.entries(update.changed)
            .map(([name, v]) => `${name}: ${v.before} → ${Object.keys(v.after).length}`)
            .join(', ');
        console.log(`   ${update.owner} / ${update.context} — ${update.personKeys} chiavi persona (${detail})`);
    }

    if (!args.apply) {
        console.log('\nDry-run: nessuna scrittura eseguita. Rilancia con --apply per applicare.');
        await mongoose.disconnect();
        process.exit(0);
    }

    const collection = mongoose.connection.collection('tasteprofiles');
    for (const update of updates) {
        const setFields = {};
        for (const [name, value] of Object.entries(update.changed)) {
            setFields[`compiledVectors.${name}`] = value.after;
        }
        await collection.updateOne({ _id: update.id }, { $set: setFields });
    }

    console.log(`\n✔ Vettori ripuliti: ${updates.length} profili`);
    await mongoose.disconnect();
    process.exit(0);
}

main().catch(async (err) => {
    console.error('Errore:', err.message);
    try { await mongoose.disconnect(); } catch { /* ignore */ }
    process.exit(1);
});
