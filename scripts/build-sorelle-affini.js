#!/usr/bin/env node
/**
 * scripts/build-sorelle-affini.js
 *
 * QUALI SORELLE DEL GRAFO SONO DAVVERO PARENTI: precalcolo dell'affinità fra keyword.
 *
 * Perché esiste. `tema X` non filtra solo `X`: il grafo gerarchico espande con le keyword dello
 * stesso micro-cluster L1. Il cluster però mescola livelli diversi — quello di `princess` è
 * `fairy, princess, enchant, fairy godmother, prince, enchantment` — e `enchant` è una keyword
 * larghissima e generica: con l'OR delle sorelle, «tema principesse» restituiva anche Harry Potter
 * e Il Signore degli Anelli. Misurato nel dump: `princess`+`enchant` condividono 4 titoli su 125
 * (3%), mentre `mecha`+`gundam` ne condividono 56 su 58 (97%).
 *
 * Quindi il criterio è la **sovrapposizione reale**: una sorella resta se almeno il 15% dei suoi
 * titoli ha anche l'ancora, e se i titoli in comune sono almeno 3. Il risultato è un artefatto
 * piccolo (`src/data/sorelle-affini.json`) che il servizio legge: a runtime costo zero.
 *
 * Chi non è nell'artefatto **non viene espanso**: l'ancora da sola è un filtro preciso, ed è
 * meglio un tema stretto che un tema sostituito.
 *
 * Uso:
 *   node scripts/build-sorelle-affini.js            # scrive src/data/sorelle-affini.json
 *   node scripts/build-sorelle-affini.js --prova    # stampa e non scrive
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const duckdb = require('duckdb');
const { normalizza } = require('../src/infra/testo');
const { LESSICO_IT } = require('../src/ricerca/lessico_it');

/** Contenimento minimo: quanta parte dei titoli della sorella ha anche l'ancora. */
const SOGLIA_CONTENIMENTO = 0.15;

/** Sotto i tre titoli in comune è un caso, non un'affinità. */
const MIN_COMUNI = 3;

/** Quante keyword (per numero di titoli) entrano nell'artefatto oltre a quelle del lessico. */
const ANCORE_POPOLARI = 3000;

const DATA_DIR = process.env.TMDB_DUMP_DIR
    ? path.resolve(process.env.TMDB_DUMP_DIR)
    : path.resolve(__dirname, '../.cache/tmdb');

const DB_PATH = process.env.DUCKDB_PATH || path.join(DATA_DIR, 'catalog.duckdb');

/** Tutte le keyword di un titolo, come chiavi "m:123" / "t:456". */
function postingDelDump(con, tabella, medium) {
    return new Promise((resolve, reject) => {
        con.all(`SELECT id, keywords FROM ${tabella} WHERE keywords IS NOT NULL`, (err, righe) => {
            if (err) return reject(err);
            resolve({ medium, righe: righe || [] });
        });
    });
}

async function main() {
    const prova = process.argv.includes('--prova');
    const grafo = require('../src/data/hierarchical_graph.json');
    const { kw_to_L1 = {}, L1 = {} } = grafo;

    if (!fs.existsSync(DB_PATH)) {
        console.error(`[sorelle] database non trovato: ${DB_PATH}`);
        process.exit(1);
    }

    console.log(`[sorelle] dump: ${DB_PATH}`);
    const db = new duckdb.Database(DB_PATH, { access_mode: 'READ_ONLY' });
    const con = db.connect();

    const [film, serie] = await Promise.all([
        postingDelDump(con, 'movies', 'movie'),
        postingDelDump(con, 'tv', 'series')
    ]);

    // keyword → titoli che la portano (ordinati: l'intersezione è lineare)
    const titoli = new Map();
    for (const { medium, righe } of [film, serie]) {
        for (const riga of righe) {
            let keyword;
            try { keyword = JSON.parse(riga.keywords); } catch (_e) { continue; }
            if (!Array.isArray(keyword)) continue;
            const chiave = `${medium[0]}:${riga.id}`;
            for (const voce of keyword) {
                const nome = voce && voce.name ? String(voce.name) : null;
                if (!nome) continue;
                const elenco = titoli.get(nome);
                if (elenco) elenco.push(chiave);
                else titoli.set(nome, [chiave]);
            }
        }
    }
    for (const elenco of titoli.values()) elenco.sort();
    console.log(`[sorelle] ${titoli.size} keyword su ${film.righe.length + serie.righe.length} titoli`);

    // Le ancore che vale la pena valutare: quelle del lessico italiano (ciò che la gente scrive)
    // più le keyword più usate del dump (i nomi inglesi che si digitano davvero).
    const ancore = new Set();
    for (const valori of Object.values(LESSICO_IT)) for (const valore of valori) ancore.add(valore);
    const popolari = Array.from(titoli.entries())
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, ANCORE_POPOLARI)
        .map(([nome]) => nome);
    for (const nome of popolari) ancore.add(nome);

    let valutate = 0;
    let sorelleTenute = 0;
    let sorelleScartate = 0;
    const affini = {};

    for (const ancora of ancore) {
        const l1 = kw_to_L1[ancora] || kw_to_L1[normalizza(ancora)];
        if (!l1) continue;
        const cluster = L1[l1] && Array.isArray(L1[l1].keywords) ? L1[l1].keywords : [];
        if (cluster.length < 2) continue;

        const titoliAncora = titoli.get(ancora);
        if (!titoliAncora) continue;

        const tenute = [];
        for (const sorella of cluster) {
            if (sorella === ancora) continue;
            const titoliSorella = titoli.get(sorella);
            if (!titoliSorella || titoliSorella.length === 0) continue;

            const comuni = interseca(titoliAncora, titoliSorella).length;
            const contenimento = comuni / titoliSorella.length;
            if (comuni >= MIN_COMUNI && contenimento >= SOGLIA_CONTENIMENTO) {
                tenute.push({ nome: sorella, comuni, contenimento });
                sorelleTenute += 1;
            } else {
                sorelleScartate += 1;
            }
        }

        valutate += 1;
        if (tenute.length === 0) continue;
        tenute.sort((a, b) => b.contenimento - a.contenimento);
        affini[normalizza(ancora)] = tenute.map(t => t.nome);
    }

    const uscita = {
        versione: 1,
        soglia: { contenimento: SOGLIA_CONTENIMENTO, comuni: MIN_COMUNI },
        affini
    };

    console.log(`[sorelle] ${valutate} ancore valutate · ${sorelleTenute} sorelle tenute · ${sorelleScartate} scartate`);
    console.log(`[sorelle] esempio princess → ${JSON.stringify(affini.princess || [])}`);
    console.log(`[sorelle] esempio mecha    → ${JSON.stringify(affini.mecha || [])}`);
    console.log(`[sorelle] esempio isekai   → ${JSON.stringify(affini.isekai || [])}`);

    if (prova) {
        console.log('[sorelle] --prova: non scrivo niente');
    } else {
        const destinazione = path.join(__dirname, '../src/data/sorelle-affini.json');
        // Chiavi ordinate: il diff fra due build dice solo cosa è cambiato.
        const ordinato = { versione: uscita.versione, soglia: uscita.soglia, affini: {} };
        for (const chiave of Object.keys(affini).sort()) ordinato.affini[chiave] = affini[chiave];
        fs.writeFileSync(destinazione, `${JSON.stringify(ordinato, null, 0)}\n`);
        const kb = Math.round(fs.statSync(destinazione).size / 1024);
        console.log(`[sorelle] scritto ${destinazione} (${kb} KB)`);
    }

    con.close(() => db.close(() => process.exit(0)));
}

/** Intersezione di due elenchi ordinati. */
function interseca(a, b) {
    const uscita = [];
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
        if (a[i] === b[j]) { uscita.push(a[i]); i += 1; j += 1; }
        else if (a[i] < b[j]) i += 1;
        else j += 1;
    }
    return uscita;
}

main().catch(err => {
    console.error('[sorelle] errore:', err.message);
    process.exit(1);
});
