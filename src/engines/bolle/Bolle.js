/**
 * src/engines/bolle/Bolle.js — IL GRAFO DELLE BOLLE nel prodotto.
 *
 * Cosa fa: data una **storia** (i titoli che un profilo ha visto, coi loro segnali) restituisce il
 * **portafoglio**: i mondi accesi, con quanto sono accesi e chi ci sta dentro.
 *
 * Da dove viene: `graph/` (Python, offline). L'artefatto che legge — `src/data/bolle.json` — lo scrive
 * `python -m graph.pipeline esporta`, e **i parametri viaggiano con l'artefatto**: l'engine non cabla
 * nessun numero, li prende da `data.versione`. Se un iperparametro cambia in `graph/parametri.py`, lo
 * si ritrova qui dopo aver riesportato — e l'impronta della ricetta lo registra.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * COSA QUESTO ENGINE **NON** FA, e va detto perché non è una dimenticanza:
 *
 * 1. **Non cammina sui titoli, cammina sulle bolle.** Nel modulo la diffusione gira sui 13,2 milioni
 *    di archi fra titoli; qui gira sui 45.194 archi fra bolle. La conseguenza: l'attivazione **per
 *    titolo** non c'è, quindi **l'ordine dentro una bolla non viene da qui** — lo decide chi invoca,
 *    che ha il catalogo (per voto, per anno, per popolarità: è una scelta di prodotto).
 * 2. **Non colloca i titoli nuovi.** Un'uscita del 2026 non è nel grafo: la colloca il job notturno
 *    (`graph/collocator.py`, ~11 ms per titolo), che la assegna a una bolla sull'artefatto.
 * 3. **Non decide quali liste mostrare.** Restituisce il portafoglio; le quattro liste (il tuo mondo,
 *    un passo fuori, le uscite nuove, la nicchia di qualità) le compone chi invoca, perché servono
 *    dati che stanno nel suo database (date, popolarità, voto medio).
 *
 * Uso:
 *   const bolle = require('./src/engines/bolle/Bolle');
 *   const p = bolle.portafoglio([{ chiave: 'movie:603', plays: 2, tipo: 'loved' }]);
 *   // → [{ bolla: 1084, attivazione: 0.043, titoli: 25, voti: 636, vicini: [...] }, ...]
 */

class Bolle {
    constructor() {
        this.data = null;
        this.membriCache = new Map();
    }

    loadData() {
        if (this.data) return this.data;
        // `require` di un JSON lo carica una volta sola e lo tiene in memoria: la convenzione del
        // prodotto (la usa anche `HierarchicalGraph` per il suo grafo).
        this.data = require('../../data/bolle.json');
        this.nBolle = Object.keys(this.data.bolle).length;
        return this.data;
    }

    get versione() {
        return this.loadData().versione;
    }

    /** La bolla di un titolo del canone, o `undefined` se non c'è. */
    bollaDi(chiave) {
        return this.loadData().titoli[chiave];
    }

    /** I titoli di una bolla. Indice inverso costruito una volta e tenuto in memoria. */
    membri(bolla) {
        if (this.membriCache.size === 0) {
            this.loadData();
            for (const [chiave, b] of Object.entries(this.data.titoli)) {
                if (!this.membriCache.has(b)) this.membriCache.set(b, []);
                this.membriCache.get(b).push(chiave);
            }
        }
        return this.membriCache.get(Number(bolla)) || [];
    }

    /** I vicini sulla mappa 6+2: 6 intra-medium + 2 ponti cross-medium, simmetrizzati. */
    vicini(bolla) {
        const b = this.loadData().bolle[String(bolla)];
        return b ? b.vicini : [];
    }

    /**
     * Il peso di un titolo della storia. Le stesse tre regole del modulo (`graph/camminata.py`),
     * coi valori letti dall'artefatto: film `min(plays, tetto)`; serie `1 + 2 × frazione di episodi`;
     * tutto moltiplicato per il fattore del tipo di segnale (loved, liked, library, watched).
     */
    peso(chiave, plays = 1, tipo = 'watched') {
        const v = this.loadData().versione;
        const nep = this.loadData().episodi[chiave] || 1;
        const pl = Number(plays) || 1;
        const base = nep > 1
            ? v.peso_serie[0] + v.peso_serie[1] * Math.min(pl / nep, 1)
            : Math.min(pl, v.peso_film_max);
        return base * (v.fattore_tipo[tipo] ?? 1);
    }

    /**
     * La diffusione sulle bolle: PageRank personalizzato.
     * `storia` = [{ chiave, plays, tipo }] — `tipo` è facoltativo e vale `watched`.
     * Restituisce `[[bolla, attivazione], ...]` ordinate dalla più accesa.
     */
    attiva(storia) {
        const v = this.loadData().versione;
        const seme = new Float64Array(this.nBolle);
        let tot = 0;
        for (const voce of storia || []) {
            const b = this.bollaDi(voce.chiave);
            if (b === undefined) continue;
            const w = this.peso(voce.chiave, voce.plays, voce.tipo);
            seme[b] += w;
            tot += w;
        }
        if (tot === 0) return [];
        for (let b = 0; b < this.nBolle; b++) seme[b] /= tot;

        let r = Float64Array.from(seme);
        for (let it = 0; it < v.iterazioni; it++) {
            const nuovo = new Float64Array(this.nBolle);
            for (let b = 0; b < this.nBolle; b++) {
                if (r[b] === 0) continue;
                const vic = this.vicini(b);
                if (vic.length === 0) { nuovo[b] += r[b]; continue; }
                const quota = r[b] / vic.length;
                for (const j of vic) nuovo[j] += quota;
            }
            for (let b = 0; b < this.nBolle; b++) {
                r[b] = v.alpha * seme[b] + (1 - v.alpha) * nuovo[b];
            }
        }
        const somma = r.reduce((a, x) => a + x, 0) || 1;
        const fuori = [];
        for (let b = 0; b < this.nBolle; b++) {
            if (r[b] > 0) fuori.push([b, r[b] / somma]);
        }
        return fuori.sort((a, b) => b[1] - a[1]);
    }

    /**
     * IL PORTAFOGLIO: i mondi accesi, coi loro titoli. È la risposta che il modulo chiama «contratto
     * di ritorno» — senza soglie: il numero di liste lo decide chi invoca, perché non esiste una soglia
     * onesta (una storia casuale accende *più* mondi di una vera).
     */
    portafoglio(storia, { quante = 4 } = {}) {
        const att = this.attiva(storia);
        return att.slice(0, Math.max(1, quante)).map(([bolla, attivazione]) => ({
            bolla,
            attivazione,
            titoli: this.data.bolle[String(bolla)].n,
            voti: this.data.bolle[String(bolla)].voti,
            vicini: this.vicini(bolla),
            membri: this.membri(bolla),
        }));
    }

    /** Quanti titoli di questa storia il grafo conosce. Serve a decidere se il profilo è «freddo». */
    copertura(storia) {
        const v = this.loadData().versione;
        const noti = (storia || []).filter((x) => this.bollaDi(x.chiave) !== undefined).length;
        return { noti, totale: (storia || []).length, freddo: noti < v.freddo_sotto };
    }
}

// Un'istanza singoletto, come `HierarchicalGraph`: il JSON resta in memoria una volta sola.
module.exports = new Bolle();
