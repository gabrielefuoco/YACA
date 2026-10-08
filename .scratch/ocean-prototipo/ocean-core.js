/**
 * .scratch/ocean-prototipo/ocean-core.js   —  PROTOTIPO, non produzione.
 *
 * DA DOVE VENGONO I 5 ASSI
 * OCEAN è un modello psicometrico della PERSONA (Costa & McCrae). Qui si fa la
 * cosa che serve al prototipo: proiettare il contenuto su 5 assi densi, così da
 * poter rispondere a una domanda precisa — «una rappresentazione a 5 dimensioni
 * generalizza meglio del vettore sparso quando i segnali sono pochi?».
 *
 * ONESTÀ SULLA PROVENIENZA: questo OCEAN **non** è un'annotazione psicometrica
 * dei titoli. È la proiezione dei 70 nodi L4 del grafo (quelli con `ui_name`
 * italiano, già scritti a mano) su 5 assi definiti sotto. Quindi misura la
 * FORMA (5 numeri densi) e non la provenienza (etichette OCEAN vere da LLM o da
 * questionario). Se la forma vince a freddo, vale la pena pagare per la
 * provenienza; se non vince, non serve annotare niente.
 *
 * I 5 assi, operazionalizzati sul contenuto (non sulla persona che guarda):
 *   O  Apertura      — chiede curiosità, tollera l'ambiguo: arte, idee, scienza,
 *                      mondi e culture altri, spiritualità. Negativo: comfort, formula.
 *   C  Coscienziosità— struttura, dovere, metodo, competenza, regole, lavoro,
 *                      ricostruzione storica. Negativo: caos, sregolatezza.
 *   E  Estroversione — energia e stimolazione: azione, festa, folla, avventura,
 *                      performance, velocità. Negativo: solitudine, silenzio, lentezza.
 *   A  Amicalità     — calore e cooperazione: famiglia, amicizia, amore, cura,
 *                      animali, comunità. Negativo: crudeltà, vendetta, cinismo.
 *   N  Nevroticismo  — minaccia emotiva: ansia, trauma, lutto, malattia mentale,
 *                      dipendenza, orrore. Negativo: comfort, leggerezza, guarigione.
 *
 * Tutti i valori stanno in [-1, +1]: 0 significa «non dice niente su questo asse».
 */

const graph = require('../../src/engines/graph/HierarchicalGraph');

const TRAITS = ['O', 'C', 'E', 'A', 'N'];

// ============================================================================
// Il lessico: 70 nodi L4 × 5 assi.  [O, C, E, A, N]
// L'ordine è quello di `ui_name` nel grafo, così si controlla a colpo d'occhio.
// ============================================================================
const L4_TRAITS = {
    m_0:  [ 1, .5, .5,   0, -.5], // Avventura Spaziale e Destino
    m_1:  [.5, .5, .5, -.5,  .5], // Spionaggio e Intrighi
    m_2:  [  0, -.5, -.5, -.5,  1], // Dipendenza e Conflitti
    m_3:  [  0,   0, .5,  -1,  .5], // Criminalità Organizzata
    m_4:  [.5, .5, .5, -.5,   0], // Teatro e Inganni
    m_5:  [  0, .5,  0,   1,   0], // Vita Quotidiana e Relazioni
    m_6:  [.5, .5, .5,  .5, -.5], // Cavalleria e Leggende
    m_7:  [  0, -.5,  0,  -1,   1], // Horror e Carneficine
    m_8:  [  0, .5, .5,   1, -.5], // Matrimonio e Celebrazioni
    m_9:  [  1,  1, -.5, .5,   0], // Ambiente e Documentari
    m_10: [.5,   0, -.5,  0,  .5], // Gotico e Mistero
    m_11: [.5,   1, -.5,  1, -.5], // Vita Rurale e Agricoltura
    m_12: [  1,   0, .5,   1, -.5], // Animazione e Fantasy
    m_13: [  0, -.5,  0,  -1,   1], // Oscurità e Sadismo
    m_14: [-.5,  1,  1,   0,   0], // Sport e Competizione
    m_15: [.5,   0,  1,  .5, -.5], // Viaggi e Avventure
    m_16: [  0, -.5,  1, -.5,  .5], // Giochi d'Azzardo e Viaggi
    m_17: [  0, .5, -.5, .5,  .5], // Misteri di Provincia
    m_18: [.5,   0, -.5, .5,   1], // Famiglia e Decadenza
    m_19: [.5,   0, .5,  .5,  .5], // Scuola e Adolescenza
    m_20: [  0,   0, -.5, .5,   1], // Dipendenze e Riabilitazione
    m_21: [  0, -.5,  1,  .5, -.5], // Feste e Relazioni
    m_22: [.5,  .5,  1,   0,   0], // Moda e Intrattenimento
    m_23: [.5,  .5, .5,  -1,  .5], // Manipolazione e Potere
    m_24: [  0,   0, .5,  -1,   1], // Giochi Mortali
    m_25: [.5,  .5,  0, -.5,   1], // Nazismo e Storia
    m_26: [  0,  .5,  1, -.5,   1], // Far West e Duelli
    m_27: [.5,   1, .5,   0,   0], // Arti Marziali e Onore
    m_28: [.5,  .5, .5, -.5,  .5], // Politica e Scandali
    m_29: [.5,   0, .5,  .5,   0], // Cinema Asiatico-Americano
    m_30: [  0,  .5,  0, -.5,   1], // Sorveglianza e Pericolo
    m_31: [-.5, .5,  1,   0,   0], // Corse e Automobilismo
    m_32: [.5,  -1,  1,   0,  .5], // Eccessi e Intrattenimento
    m_33: [.5,  .5,  0,  .5,  .5], // Conflitti e Giustizia
    m_34: [.5,   0,  0,   1,   1], // Amore Tragico
    m_35: [  1,  .5, .5,   1,  .5], // Diritti Civili e Razzismo
    m_36: [  0, -.5, .5,  -1,   1], // Prostituzione e Exploitation
    m_37: [  0,  .5, -.5, -.5,   1], // Noir Nordico e Crimini
    m_38: [  0,   0,  0, -.5,   1], // Infedeltà e Conflitti
    m_39: [.5,  .5,  0,  .5,  .5], // Fede e Conflitti Religiosi
    m_40: [  0,   0, .5,  -1,   1], // Violenza e Sopravvivenza
    m_41: [.5,  .5,  0,   0,  .5], // Potere e Conflitto Sociale
    m_42: [  1,   0, -.5, .5,   0], // Spiritualità e Mistero
    m_43: [  1,  .5,  0,   0,  .5], // Scienza e Alterazioni
    m_44: [  0,  .5, .5,   1,  -1], // Famiglia e Infanzia
    m_45: [  0,   0,  0,  -1,   1], // Abusi e Soprusi
    m_46: [  1,   0, -.5,  0,   1], // Arte e Decadenza
    m_47: [.5,   0, -.5,  .5,   1], // Viaggi e Perdite
    m_48: [.5,  .5, .5, -.5,  .5], // Colonialismo e Rivalità
    m_49: [.5,  .5,  0,   1,  .5], // Tradizione e Migrazione
    m_50: [  0,   1, .5,  .5,   0], // Lavoro e Rinascita
    m_51: [  1,  .5,  1,  .5,   0], // Musica e Performance
    m_52: [.5,   0, .5,  .5,  .5], // Mostri e Avventura
    m_53: [  0,  .5, .5, -.5,  .5], // Giustizia e Vendetta
    m_54: [.5,   0, .5,  .5,  .5], // Amore e Rivoluzione
    m_55: [.5,  .5,  0,   1,  .5], // Migrazione e Redenzione
    m_56: [.5,  .5,  0,   1,  .5], // Disabilità e Guarigione
    m_57: [.5, -.5, .5, -.5,   1], // Apocalisse e Sovversione
    m_58: [  0,   0,  0, -.5,   1], // Famiglia e Tradimenti
    m_59: [  0, -.5,  0,  -1,   1], // Mutilazione e Violenza Estrema
    m_60: [.5,   0, -.5, .5,   1], // Disabilità e Dualità
    m_61: [  1,   0,  0,  .5,   0], // Cinema e Nostalgia
    m_62: [.5,   0, .5, -.5,   1], // Distruzione e Segreti
    m_63: [.5,   0,  0, -.5,   1], // Bullismo e Soprannaturale
    m_64: [  0,   0, .5,  -1,   1], // Fuoco e Vendetta
    m_65: [.5, -.5, .5,  .5,   0], // Commedie Indie e Slacker
    m_66: [  0,   0,  0,   1,   1], // Dolore e Famiglia
    m_67: [  1,   0, .5,   0,   0], // Satira e Assurdità
    m_68: [.5,   0,  0,   0,   1], // Dramma Intenso
    m_69: [  0,  .5, .5,   1,  -1], // Commedia Classica
};

// I generi dicono meno dei nodi L4, ma coprono gli item senza keyword.
const GENRE_TRAITS = {
    28:    [  0,   0,  1,   0,  .5], // Azione
    12:    [.5,   0,  1,   0,   0], // Avventura
    16:    [.5,   0,  0,  .5,   0], // Animazione
    35:    [  0,   0, .5,  .5,  -1], // Commedia
    80:    [  0,   0,  0,  -1,  .5], // Crime
    99:    [  1,   1,  0,  .5,   0], // Documentario
    18:    [  0,   0,  0,   0,  .5], // Dramma
    10751: [  0,   0,  0,   1,  -1], // Famiglia
    14:    [  1,   0,  0,  .5,   0], // Fantasy
    36:    [.5,   1,  0,   0,   0], // Storia
    27:    [  0,   0,  0, -.5,   1], // Horror
    10402: [.5,   0,  1,  .5,   0], // Musica
    9648:  [.5,   0,  0,   0,  .5], // Mistero
    10749: [  0,   0,  0,   1,  .5], // Romance
    878:   [  1,   0,  0,   0,  .5], // Fantascienza
    53:    [  0,   0,  0,   0,   1], // Thriller
    10752: [  0,  .5,  0, -.5,   1], // Guerra
    37:    [  0,  .5, .5, -.5,   0], // Western
    10759: [  0,   0,  1,   0,  .5], // Azione & Avventura (TV)
    10762: [  0,   0,  0,   1,  -1], // Kids
    10764: [  0,   0, .5,   0,   0], // Reality
    10765: [  1,   0,  0,   0,  .5], // Sci-Fi & Fantasy (TV)
    10766: [  0,   0,  0,  .5,  .5], // Soap
    10768: [  0,  .5,  0,   0,  .5], // War & Politics
};

// ============================================================================
// Dal titolo agli assi
// ============================================================================

/** Nodo L4 di una keyword, per nome o per id. null se fuori dal grafo. */
function l4ForKeyword(value) {
    const data = graph.data;
    if (!data || !data.kw_to_L1) return null;
    let name = null;
    if (typeof value === 'object' && value !== null) name = value.name ? String(value.name).toLowerCase().trim() : null;
    else {
        const s = String(value).toLowerCase().trim();
        if (!/^\d+$/.test(s)) name = s;
    }
    if (!name) return null;
    const l1 = data.kw_to_L1[name];
    if (!l1) return null;
    const l2 = data.L1?.[l1]?.parent;
    const l3 = l2 ? data.L2?.[l2]?.parent : null;
    const l4 = l3 ? data.L3?.[l3]?.parent : null;
    return l4 || null;
}

/** keywordsOf: [{id,name}] | ['nome'] | [id] — come arrivano dal parquet. */
function keywordsOf(item) {
    const raw = Array.isArray(item.keywords) ? item.keywords
        : (Array.isArray(item.keywords?.results) ? item.keywords.results : (item.keywords?.keywords || []));
    return raw.filter(Boolean);
}

function genreIdsOf(item) {
    const raw = Array.isArray(item.genres) ? item.genres : [];
    return raw.map(g => Number(g.id ?? g)).filter(Number.isFinite);
}

/**
 * Distribuzione dell'item sui nodi L4: quanti dei suoi keyword cadono in ogni nodo.
 * Copertura: ogni keyword mappata conta 1, i non mappati si contano a parte.
 */
function itemL4Distribution(item) {
    const hist = new Map();
    let mapped = 0;
    let unmapped = 0;
    for (const kw of keywordsOf(item)) {
        const l4 = l4ForKeyword(kw);
        if (!l4) { unmapped += 1; continue; }
        hist.set(l4, (hist.get(l4) || 0) + 1);
        mapped += 1;
    }
    return { hist, mapped, unmapped };
}

/**
 * Vettore OCEAN di un titolo: media pesata dei nodi L4 (peso 1) e dei generi (peso 1.5).
 * @returns {{vector: number[]|null, coverage: number, signals: number}}
 */
function itemOcean(item, options = {}) {
    const genreWeight = options.genreWeight ?? 1.5;
    const { hist, mapped, unmapped } = itemL4Distribution(item);
    const acc = [0, 0, 0, 0, 0];
    let total = 0;

    for (const [l4, count] of hist) {
        const row = L4_TRAITS[l4];
        if (!row) continue;
        for (let i = 0; i < 5; i++) acc[i] += row[i] * count;
        total += count;
    }
    for (const gid of genreIdsOf(item)) {
        const row = GENRE_TRAITS[gid];
        if (!row) continue;
        for (let i = 0; i < 5; i++) acc[i] += row[i] * genreWeight;
        total += genreWeight;
    }

    const signals = mapped + (total - mapped);
    if (total === 0) return { vector: null, coverage: 0, signals: 0, unmapped };
    const vector = acc.map(v => v / total);
    return { vector, coverage: mapped > 0 ? 1 : 0, signals, unmapped };
}

/**
 * Profilo OCEAN da un insieme di titoli visti, con decadimento temporale come
 * `computeTimeDecay` (half-life 24 mesi, 60 giorni per il "recente" che conta).
 * @param {Array<{item: object, weight?: number, daysAgo?: number}>} entries
 * @returns {{vector: number[]|null, used: number, skipped: number}}
 */
function profileOcean(entries, options = {}) {
    const halfLifeDays = options.halfLifeDays ?? 180;
    const acc = [0, 0, 0, 0, 0];
    let total = 0;
    let used = 0;
    let skipped = 0;

    for (const entry of entries) {
        const { vector } = itemOcean(entry.item, options);
        if (!vector) { skipped += 1; continue; }
        const signal = Number.isFinite(entry.weight) ? entry.weight : 1;
        const days = Number.isFinite(entry.daysAgo) ? Math.max(0, entry.daysAgo) : 0;
        const decay = Math.max(0.05, Math.pow(0.5, days / halfLifeDays));
        const w = signal * decay;
        for (let i = 0; i < 5; i++) acc[i] += vector[i] * w;
        total += w;
        used += 1;
    }

    if (total === 0) return { vector: null, used, skipped };
    return { vector: acc.map(v => v / total), used, skipped };
}

/** Coseno fra due vettori 5-dim (il profilo può avere componenti negative). */
function cosine(a, b) {
    if (!a || !b) return 0;
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < 5; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    if (na === 0 || nb === 0) return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function describe(vector) {
    if (!vector) return 'nessun vettore';
    return TRAITS.map((t, i) => `${t}=${vector[i].toFixed(2)}`).join(' ');
}

/** Le tinte forti di un vettore, per leggerlo in una riga. */
function strongest(vector) {
    if (!vector) return '';
    const ordered = TRAITS
        .map((t, i) => ({ t, v: vector[i] }))
        .sort((a, b) => Math.abs(b.v) - Math.abs(a.v))
        .slice(0, 3);
    return ordered.map(o => `${o.t}${o.v >= 0 ? '+' : '-'}=${o.v.toFixed(2)}`).join(' ');
}

module.exports = {
    TRAITS,
    L4_TRAITS,
    GENRE_TRAITS,
    l4ForKeyword,
    keywordsOf,
    genreIdsOf,
    itemL4Distribution,
    itemOcean,
    profileOcean,
    cosine,
    describe,
    strongest
};
