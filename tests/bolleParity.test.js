/**
 * PARITÀ PYTHON <-> JAVASCRIPT — il rischio che il senior temeva di più (ticket 16).
 *
 * Ci sono due motori che devono parlare la stessa lingua: `graph/motore.py`, che MISURA e decide i
 * parametri, e `src/engines/bolle/Bolle.js`, che serve il prodotto. Il pericolo non è che uno dei due
 * si rompa — è che qualcuno cambi una formula in Python, misuri che migliora, e **dimentichi il
 * JavaScript**. Da lì in poi il numero misurato non è più quello servito, e nessuno se ne accorge.
 *
 * Il golden lo genera Python: `python -m graph.pipeline parita --fuori tests/fixtures/parita.json`.
 * Ha DUE livelli, e non sono la stessa cosa:
 *
 *   1. `semi[].peso` — i pesi della storia. Questi devono coincidere **esattamente**: sono la stessa
 *      formula scritta due volte.
 *   2. `bolla_pura` — l'algoritmo del prodotto ricalcolato in Python **con scipy** (una matrice) invece
 *      che coi cicli come fa `Bolle.js`. Due implementazioni indipendenti della stessa cosa: devono
 *      coincidere a meno dell'errore in virgola mobile, e l'ordine dei mondi dev'essere lo stesso.
 *   3. `titoli_aggregato` — il motore VERO, che cammina sui titoli (13,2 milioni di archi), aggregato
 *      alle bolle. Qui l'uguaglianza NON c'è e non deve esserci: è la semplificazione dichiarata. Il
 *      test confronta i due ordinamenti con una soglia e ne STAMPA il costo, perché serve a protestare
 *      se un giorno quel costo cresce.
 *
 * Le soglie non sono inventate: sono state misurate generando il fixture (vedi il commento accanto).
 */
const path = require('path');
const fs = require('fs');
const Bolle = require('../src/engines/bolle/Bolle');

const FIXTURE = path.join(__dirname, 'fixtures', 'parita.json');
const golden = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));

/** La diffusione del prodotto, riscritta qui seguendo il fixture — non chiamando `Bolle.attiva`. */
function bollaPura(semi, iterazioni, alpha) {
    const n = Bolle.nBolle;
    const seme = new Float64Array(n);
    let tot = 0;
    for (const s of semi) { seme[s.bolla] += s.peso; tot += s.peso; }
    for (let b = 0; b < n; b++) seme[b] /= tot;
    let r = Float64Array.from(seme);
    for (let it = 0; it < iterazioni; it++) {
        const nuovo = new Float64Array(n);
        for (let b = 0; b < n; b++) {
            if (r[b] === 0) continue;
            const riga = Bolle.data.bolle[String(b)].P;
            for (const [dest, w] of riga) nuovo[dest] += r[b] * w;
        }
        for (let b = 0; b < n; b++) r[b] = alpha * seme[b] + (1 - alpha) * nuovo[b];
    }
    const somma = r.reduce((a, x) => a + x, 0) || 1;
    return Array.from(r).map((x, b) => [b, x / somma]).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]);
}

const top = (l, n) => l.slice(0, n).map((x) => x[0]);
const jaccard = (a, b) => {
    const A = new Set(a), B = new Set(b);
    const inter = [...A].filter((x) => B.has(x)).length;
    return inter / new Set([...A, ...B]).size;
};

describe('parità Python <-> JavaScript', () => {
    test("l'artefatto è quello con cui è stato generato il golden", () => {
        // Se questo salta, NON è un bug: è che `src/data/bolle.json` è stato riesportato e il golden è
        // vecchio. Si rigenera con il comando scritto in cima a questo file.
        expect(Bolle.versione.artefatto).toBe(golden.versioni.artefatto);
        expect(Bolle.versione.ricetta).toBe(golden.versioni.ricetta);
    });

    test('i pesi dei semi coincidono esattamente', () => {
        for (const storia of golden.storie) {
            for (const s of storia.semi) {
                const mio = Bolle.peso(s.chiave, s.plays, s.tipo);
                expect({ chiave: s.chiave, peso: mio }).toEqual({ chiave: s.chiave, peso: s.peso });
            }
        }
    });

    test('la stessa cosa, calcolata due volte: scipy (Python) e i cicli (JS)', () => {
        const diagnosi = [];
        for (const storia of golden.storie) {
            const mia = bollaPura(storia.semi, Bolle.versione.iterazioni, Bolle.versione.alpha);
            const sua = storia.bolla_pura;
            // L'ordine dei mondi dev'essere lo stesso, e i valori coincidere a meno del floating point.
            expect(top(mia, 10)).toEqual(top(sua, 10));
            const perBolla = new Map(sua);
            const massimo = Math.max(...sua.map((x) => x[1]));
            let peggio = 0, dove = null, valMio = 0, valSuo = 0;
            for (const [b, v] of mia.slice(0, 30)) {
                if (!perBolla.has(b)) continue;
                // ERRORE NORMALIZZATO AL MASSIMO, non relativo al valore: la diffusione sparge la massa
                // su 3.497 mondi, quindi in coda i valori sono minuscoli e un errore relativo li' e'
                // enorme pur essendo 1e-9 in assoluto. Quello che conta e' quanto pesa l'errore
                // RISPETTO AL MONDO PIU' ACCESO.
                const d = Math.abs(v - perBolla.get(b)) / massimo;
                if (d > peggio) { peggio = d; dove = b; valMio = v; valSuo = perBolla.get(b); }
            }
            diagnosi.push({ storia: storia.nome, peggio, dove, valMio, valSuo, quanti: sua.length });
            // L'errore si STAMPA PRIMA di protestare: se un giorno questo test si accende, il numero e la
            // bolla devono essere gia' sullo schermo.
            console.log(`    ${storia.nome.padEnd(28)} errore normalizzato ${peggio.toExponential(1)}` +
                ` sulla bolla ${dove} (${valMio.toExponential(4)} contro ${valSuo.toExponential(4)})` +
                ` · mondi con attivazione ${sua.length}`);
            // TOLLERANZA: MISURATA **1,1e-8** dopo che la causa è stata chiusa. Prima era 4,2e-5 e la
            // causa non era isolata: l'artefatto arrotondava i pesi a 4 decimali SENZA rinormalizzare
            // (le righe si scostavano da 1 fino a 7e-4) e `pipeline.parita` salvava `r` SENZA dividerlo
            // per `r.sum()`, mentre `Bolle.js` lo divide. Due errori che si sommavano. Adesso l'export
            // rinormalizza, `parita` normalizza, e la soglia può stare a 1e-6 con novanta volte di
            // margine. Quello che questo test deve prendere non è il rumore: è una formula cambiata da
            // una parte sola.
            expect(peggio).toBeLessThan(1e-6);
        }
        console.log('  ^ le due implementazioni della stessa diffusione: scipy (Python) contro i cicli (JS)');
    });

    test('il portafoglio vero di Bolle.js regge il confronto, e ne misuriamo il costo', () => {
        const righe = [];
        for (const storia of golden.storie) {
            const mia = Bolle.attiva(storia.semi);
            const attesa = storia.titoli_aggregato;
            const jac = jaccard(top(mia, 10), top(attesa, 10));
            const primoDentro = top(mia, 10).includes(top(attesa, 1)[0]);
            // SOGLIE MISURATE il 16/10/2026, generando il fixture: jaccard 0,25 · 0,43 · 0,54 · 0,54 ·
            // 0,54; il primo mondo del motore vero cade sempre nei primi 10 di quello del prodotto.
            // Non sono un traguardo: sono il costo della semplificazione dichiarata (bolle invece di
            // titoli). Se scendono sotto, o una formula è cambiata da una parte sola, o la
            // semplificazione è peggiorata — e in entrambi i casi si vuole sapere.
            righe.push({ storia: storia.nome, jaccard: jac.toFixed(2), primoDentro });
            expect(jac).toBeGreaterThan(0.20);
            expect(primoDentro).toBe(true);
        }
        // Il costo, a ogni `npm test`, sotto gli occhi di chi legge.
        console.log('\n  quanto costa la semplificazione dichiarata (bolle invece di titoli):');
        for (const r of righe) {
            console.log(`    ${r.storia.padEnd(28)} jaccard primi 10 ${r.jaccard}` +
                ` · primo mondo del motore vero nei primi 10 del prodotto: ${r.primoDentro ? 'sì' : 'NO'}`);
        }
    });
});
