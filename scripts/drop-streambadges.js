#!/usr/bin/env node
/**
 * Bonifica della collezione `streambadges` (ticket 08 della mappa doppiaggio-ita).
 *
 * PERCHE' ESISTE
 * La collezione era scritta dalla "sonda torrent" di YACA: per sapere se un titolo aveva
 * l'audio italiano apriva uno stream via Torrentio e ne deduceva la presenza. Quel percorso
 * e' stato rimosso (il badge ITA ora viene dalle annotazioni di antoniogenna.net), quindi la
 * collezione e' un residuo: 24.830 documenti che non alimentano piu' niente, e 3.044 titoli
 * non-anime che mostravano un badge falso.
 *
 * COME SI USA
 *   node scripts/drop-streambadges.js                       # conta e basta (non tocca niente)
 *   node scripts/drop-streambadges.js --backup <file>       # esporta la collezione in NDJSON.gz
 *   node scripts/drop-streambadges.js --drop --confirm      # droppa (richiede --confirm)
 *
 * La regola importante: **non droppa se il file di backup non esiste**. Il drop e'
 * irreversibile, e questo script non deve poterlo fare per sbaglio.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { MongoClient } = require('mongodb');

const COLLECTION = 'streambadges';

function parseArgs(argv) {
    const args = { backup: null, drop: false, confirm: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--backup') args.backup = argv[++i];
        else if (a === '--drop') args.drop = true;
        else if (a === '--confirm') args.confirm = true;
    }
    return args;
}

async function conta(collezione) {
    const totali = await collezione.countDocuments();
    const conIta = await collezione.countDocuments({ hasIta: true });
    return { totali, conIta, senzaIta: totali - conIta };
}

function stampa(titolo, n) {
    console.log(`  ${titolo}`);
    console.log(`    documenti            : ${n.totali}`);
    console.log(`    con hasIta=true      : ${n.conIta}`);
    console.log(`    senza (falsi)        : ${n.senzaIta}`);
}

async function esporta(collezione, file) {
    const dir = path.dirname(path.resolve(file));
    fs.mkdirSync(dir, { recursive: true });
    const out = fs.createWriteStream(file);
    const gz = zlib.createGzip();
    gz.pipe(out);

    let scritti = 0;
    const cursore = collezione.find({});
    for await (const doc of cursore) {
        gz.write(JSON.stringify(doc) + '\n');
        scritti++;
    }
    gz.end();
    await new Promise((resolve, reject) => {
        out.on('finish', resolve);
        out.on('error', reject);
    });
    return { scritti, byte: fs.statSync(file).size };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('[-] MONGODB_URI non impostata.');
        process.exit(2);
    }

    const client = await MongoClient.connect(uri);
    const collezione = client.db().collection(COLLECTION);

    try {
        const esiste = await collezione.estimatedDocumentCount().catch(() => 0);
        if (esiste === 0) {
            console.log('[i] La collezione non esiste o e gia vuota: niente da fare.');
            return;
        }

        console.log('[i] Stato ATTUALE della collezione:');
        const prima = await conta(collezione);
        stampa('', prima);

        if (args.backup) {
            console.log(`\n[i] Esportazione in ${args.backup} ...`);
            const { scritti, byte } = await esporta(collezione, args.backup);
            console.log(`[+] Esportati ${scritti} documenti (${(byte / 1024 / 1024).toFixed(1)} MB compressi)`);
            if (scritti !== prima.totali) {
                console.error(`[-] Esportati ${scritti} documenti ma la collezione ne ha ${prima.totali}: NON procedere.`);
                process.exit(1);
            }
            console.log('[+] Backup verificato: il conteggio combacia.');
        }

        if (args.drop) {
            if (!args.confirm) {
                console.error('\n[-] Serve --confirm per droppare. Niente e stato toccato.');
                process.exit(2);
            }
            if (!args.backup) {
                console.error('\n[-] Serve --backup <file>: il drop e irreversibile e senza copia non si fa.');
                process.exit(2);
            }
            const backupPath = path.resolve(args.backup);
            if (!fs.existsSync(backupPath)) {
                console.error(`\n[-] Il file di backup ${backupPath} non esiste: NON droppo.`);
                process.exit(2);
            }
            console.log(`\n[i] Backup presente (${(fs.statSync(backupPath).size / 1024 / 1024).toFixed(1)} MB): procedo.`);
            const esito = await collezione.drop();
            console.log(`[+] Collezione droppata (${esito ? 'ok' : 'gia assente'}).`);

            const dopo = await conta(collezione);
            stampa('\nStato DOPO:', dopo);
            if (dopo.totali !== 0) {
                console.error('[-] La collezione non e vuota: qualcosa la riscrive.');
                process.exit(1);
            }
            console.log('\n[+] Bonifica completata: 0 documenti.');
        } else {
            console.log('\n[i] Nessuna azione richiesta: la collezione non e stata toccata.');
        }
    } finally {
        await client.close();
    }
}

main().catch((err) => {
    console.error('[-] Errore:', err.message);
    process.exit(1);
});
