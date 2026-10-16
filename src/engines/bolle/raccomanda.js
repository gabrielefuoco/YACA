/**
 * IL PONTE FRA IL GRAFO E IL FEED.
 *
 * Prende la storia di un profilo, la dà a `Bolle` (il motore del grafo, che legge `src/data/bolle.json`)
 * e restituisce i **mondi accesi con i loro titoli**, nella forma che il prodotto già capisce
 * (`{ type: 'movie'|'tv', id: <tmdbId> }`), con la cache che era stata decisa e mai costruita.
 *
 * ── IL CONFINE, E NON È UNA SCORCIATOIA ────────────────────────────────────────────────────────────
 * Il motore cammina sulle BOLLE, non sui titoli: restituisce l'attivazione per MONDO. Quindi **compone
 * due delle quattro liste** e le altre due no, perché gli mancano i dati:
 *
 *   il_tuo_mondo      ✔ i membri del mondo più acceso
 *   un_passo_fuori    ✔ i membri dei tre mondi vicini, presi per PESO dell'arco
 *   uscite_nuove      ✘ servono gli ANNI, che stanno nel catalogo del prodotto
 *   nicchia_di_qualita ✘ servono popolarità e voto medio, idem
 *
 * E **non ordina dentro una bolla**: `Bolle.membri()` dà i titoli, non la loro attivazione — l'ordine
 * per titolo è il pezzo che il motore Python ha e questo no (13,2 milioni di archi contro 45.194). Chi
 * invoca ha il catalogo e ordina come vuole: voto, anno, popolarità. È il confine dichiarato nel README
 * dell'engine, e va rispettato invece che aggirato con un ordine inventato.
 *
 * ── L'ORDINE DELLE LISTE, CHE È CAMBIATO ──────────────────────────────────────────────────────────
 * Fino al 16/10/2026 la raccomandazione era «mostra prima *un passo fuori*: il quartiere batte il
 * mondo». Era un ARTEFATTO: `un_passo_fuori` raccoglieva 26-30 titoli contro i 10 delle altre liste, e
 * il confronto era fra totali di liste di lunghezza diversa. A parità di slot, misurato:
 *
 *     il_tuo_mondo        12,81% per titolo mostrato
 *     un_passo_fuori      10,62%
 *     uscite_nuove        14,12% (ma solo ~3,5 slot per utente)
 *     nicchia_di_qualita   4,31%  ← la più debole, e la più lunga
 *
 * Quindi **prima il tuo mondo**, e la nicchia **per ultima** e segnalata (`debole: true`): un posto lì
 * rende un terzo di un posto altrove.
 */

const Bolle = require('./Bolle');
const LRUCache = require('../../utils/LRUCache');

const CAP = 10;          // la capienza delle liste, la stessa del motore Python
const VICINI = 3;        // i tre mondi di «un passo fuori»

// LA CHIAVE DELLA CACHE, decisa nella mappa e costruita adesso:
//   hash(storia) · versione artefatto · impronta ricetta · slider
// Le due VERSIONI dicono con che cosa è stata calcolata la lista, i due ARGOMENTI dicono per chi. Se la
// ricetta o l'artefatto cambiano, la chiave cambia da sola e le liste vecchie non vengono più servite —
// lo stesso patto di `bolle.json` e di `metadati-canone.npz`, applicato alla cache del prodotto.
const cache = new LRUCache(500);

/** `{type: 'tv', tmdbId: 1396}` → `tv:1396`, la chiave del canone. */
function chiaveDi(voce) {
    const tipo = voce && voce.type === 'tv' ? 'tv' : 'movie';
    return `${tipo}:${Number(voce && voce.tmdbId)}`;
}

const ORDINE_SEGNALI = ['loved', 'liked', 'library', 'watched'];

/** Il tipo di segnale più forte di una voce. `library` è intenzione, non visione. */
function tipoDi(voce) {
    const visti = new Set(((voce && voce.signals) || []).map((s) => s && s.type).filter(Boolean));
    for (const t of ORDINE_SEGNALI) if (visti.has(t)) return t;
    return 'watched';
}

/**
 * Da `WatchHistory` del prodotto alla storia del motore: `[{ chiave, plays, tipo }]`.
 *
 * La forma del prodotto ha già tutto — `tmdbId` e `type` sono la chiave, `episodesWatched` è il
 * denominatore del peso delle serie, `signals` è il tipo di segnale — quindi questa è una traduzione di
 * nomi, non una interpretazione. Una voce senza `tmdbId` si scarta: il motore lavora su chiavi del
 * canone, e inventarne una sarebbe peggio che perderla.
 */
function storiaDaWatchHistory(voci) {
    const perChiave = new Map();
    for (const v of voci || []) {
        if (!v || v.tmdbId === undefined || v.tmdbId === null) continue;
        const chiave = chiaveDi(v);
        const plays = Number(v.episodesWatched) || 1;
        const tipo = tipoDi(v);
        const gia = perChiave.get(chiave);
        if (!gia) { perChiave.set(chiave, { chiave, plays, tipo }); continue; }
        // Lo stesso titolo due volte (due stagioni, due segnali): il segnale PIÙ FORTE e il massimo dei
        // plays. Sommarli gonfierebbe il peso di chi ha già visto la stessa cosa.
        gia.plays = Math.max(gia.plays, plays);
        if (ORDINE_SEGNALI.indexOf(tipo) < ORDINE_SEGNALI.indexOf(gia.tipo)) gia.tipo = tipo;
    }
    return [...perChiave.values()];
}

/** `movie:603` → `{type:'movie', id:603}`, la forma che il prodotto sa mostrare. */
function itemDi(chiave) {
    const [t, id] = String(chiave).split(':');
    return { type: t === 'tv' ? 'tv' : 'movie', id: Number(id) };
}

/**
 * IL PUNTO D'INGRESSO. `storia` è `[{chiave, plays, tipo}]` (vedi `storiaDaWatchHistory`).
 *
 * Ritorna `{liste, items, versioni, cache, esclusi}`:
 *  · `liste` — i mondi accesi, ognuno coi suoi `items` e la sua spiegazione (`come` = i termini del
 *    centroide, `perche` = i titoli della storia che l'hanno acceso);
 *  · `items` — la sequenza piatta e deduplicata, nell'ordine delle liste;
 *  · `versioni` — artefatto e impronta della ricetta (metà della chiave della cache);
 *  · `esclusi` — i titoli della storia, che chi invoca deve togliere dalle liste: il motore non conosce
 *    il catalogo e non sa cosa l'utente ha già visto.
 */
function raccomanda(storia, { quante = 4, cap = CAP } = {}) {
    const s = storiaDaWatchHistory(storia);
    const vs = Bolle.versione;
    if (s.length === 0) return { liste: [], items: [], versioni: vs, cache: false, esclusi: [] };

    const chiave = `${JSON.stringify(s)}|${vs.artefatto}|${vs.ricetta}`;
    const dentro = cache.get(chiave);
    if (dentro) return { ...dentro, cache: true };

    const portafoglio = Bolle.portafoglio(s, { quante });
    if (portafoglio.length === 0) {
        const vuoto = { liste: [], items: [], versioni: vs, esclusi: s.map((x) => x.chiave) };
        cache.set(chiave, vuoto);
        return { ...vuoto, cache: false };
    }
    // IL MONDO DEL PROFILO DEVE POTER RIEMPIRE UNA RIGA.
    // Il motore Python ha questa regola da sempre (`MIN_TITOLI_MONDO`, un iperparametro in tabella, nato
    // da un mondo di 4 titoli che produceva una lista di UN titolo) e il valore viaggia nell'artefatto:
    // qui non era applicato, e una riga da DUE titoli e' arrivata al prodotto.
    // La regola del Python e' «il primo mondo resta sempre, anche se e' piccolo: e' il mondo del
    // profilo». Qui si fa la stessa cosa con una preferenza: si prende il primo mondo che REGGE una
    // riga, e solo se nessuno la regge si torna al primo (il mondo del profilo, per piccolo che sia).
    const minimo = Number(vs.min_titoli_mondo) || 0;
    const primo = portafoglio.find((m) => (m.titoli || 0) >= minimo) || portafoglio[0];
    const regge = (bolla) => {
        const m = portafoglio.find((x) => x.bolla === bolla);
        const n = m ? (m.titoli || 0) : (Bolle.data.bolle[String(bolla)] || {}).n || 0;
        return n >= minimo;
    };
    const perBolla = (bolla) => (Bolle.membri(bolla) || []).slice(0, cap).map(itemDi);
    // «UN PASSO FUORI» E' UNA LISTA, NON TRE — ed è il bug del 16/10/2026 che ho rifatto qui al primo
    // tentativo: tre mondi da dieci fanno trenta item, e il confronto con le altre liste (da dieci)
    // diventa un artefatto. In Python si risolve ordinando per attivazione per titolo; QUI quella
    // attivazione non c'è (il motore del prodotto cammina sulle bolle, e la diffusione per titolo è il
    // pezzo che manca — è il confine dichiarato). Quindi: **round-robin fra i tre mondi**, che è fair e
    // non favorisce il mondo più forte solo perché viene prima, e il dettaglio per mondo esposto a parte
    // (`per_mondo`), così chi invoca ha tutto per riordinare col proprio catalogo.
    const vicini = primo.vicini.slice(0, VICINI).filter(regge);
    const perMondo = vicini.map((b) => ({ bolla: b, items: perBolla(b) }));
    const passo = [];
    for (let i = 0; i < cap; i++) {
        for (const g of perMondo) if (g.items[i]) passo.push(g.items[i]);
    }
    const spiega = (m) => (m ? {
        come: Bolle.descrivi(m.bolla), perche: m.da_semi || [], voti: m.voti, titoli: m.titoli,
    } : {});

    const liste = [
        { tipo: 'il_tuo_mondo', debole: false, mondo: primo.bolla, ...spiega(primo),
          items: perBolla(primo.bolla) },
        { tipo: 'un_passo_fuori', debole: false, mondo: null, ...spiega(primo),
          items: passo.slice(0, cap), per_mondo: perMondo },
        // QUESTE DUE LE COMPONE CHI INVOCA: anni, popolarità e voto medio stanno nel catalogo del
        // prodotto, e il motore non li ha. Il posto è riservato nell'ordine, così la composizione non
        // deve anche ricordarsi dove metterle.
        { tipo: 'uscite_nuove', debole: false, mondo: null, da_comporre: true, items: [] },
        { tipo: 'nicchia_di_qualita', debole: true, mondo: null, da_comporre: true, items: [] },
    ];
    const items = [];
    const visti = new Set();
    for (const l of liste) {
        for (const it of l.items) {
            const k = `${it.type}:${it.id}`;
            if (visti.has(k)) continue;
            visti.add(k);
            items.push(it);
        }
    }
    const fuori = { liste, items, versioni: vs, esclusi: s.map((x) => x.chiave) };
    cache.set(chiave, fuori);
    return { ...fuori, cache: false };
}

/**
 * LE RIGHE PER STREMIO — due righe pronte per il manifest, per un medium.
 *
 * `il tuo mondo` e `un passo fuori` sono le due liste che il motore puo' comporre da solo (le altre due
 * hanno bisogno degli anni e dei voti, che stanno nel catalogo del prodotto). Gli id sono numeri TMDB,
 * come quelli degli hero del prodotto, e le righe **entrano DOPO l'assegnazione disgiunta** degli hero:
 * non consumano il loro bacino e possono ripetere un titolo che un'altra riga ha gia' preso. E' una
 * scelta: sono due motori diversi che dicono cose diverse, e la riga del grafo si spiega da sola.
 *
 * LE RIGHE SONO CORTE, ed e' la natura del grafo: un mondo ha una mediana di 11 titoli. Non si allunga
 * prendendo dai mondi vicini — quelli sono gia' "un passo fuori".
 */
function righePerStremio(storia, { mediaType = 'movie', quante = 3, cap = 30 } = {}) {
    const tipo = mediaType === 'movie' ? 'movie' : 'tv';
    const suffisso = tipo === 'movie' ? 'movies' : 'series';
    const solo = { [`yaca_mondi_${suffisso}`]: [], [`yaca_passo_fuori_${suffisso}`]: [] };
    try {
        const r = raccomanda(storia, { quante, cap });
        // GLI ID DEVONO AVERE IL PREFISSO, non essere numeri nudi.
        // `annotationKeyFor` in `src/handlers/catalogHandler.js` risolve gli id in tre forme — `tmdb:`,
        // `tt…`, `kitsu:` — e per tutto il resto fa `return null`. Con un numero nudo il pool arriva
        // pieno (`titles=20` nei log) e le CARD restano vuote: e' il «Empty content» che si vedeva in
        // Stremio. Si usa la forma piena `tmdb:<tipo>:<id>`, dove il tipo e' scritto nell'id.
        const prendi = (nome) => {
            const l = r.liste.find((x) => x.tipo === nome);
            return l ? l.items.filter((i) => i.type === tipo)
                .map((i) => `tmdb:${tipo === 'movie' ? 'movie' : 'tv'}:${i.id}`) : [];
        };
        solo[`yaca_mondi_${suffisso}`] = prendi('il_tuo_mondo');
        solo[`yaca_passo_fuori_${suffisso}`] = prendi('un_passo_fuori');
    } catch (e) {
        // una riga vuota e' meglio di un feed rotto: se il grafo manca (artefatto assente, dati
        // inattesi) il resto delle raccomandazioni del prodotto continua a funzionare.
        console.error('[Mondi] righe del grafo non disponibili:', e && e.message);
    }
    return solo;
}

module.exports = { raccomanda, storiaDaWatchHistory, chiaveDi, tipoDi, itemDi, righePerStremio, CAP, VICINI, cache };
