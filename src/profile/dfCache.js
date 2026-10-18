/**
 * src/profile/dfCache.js
 *
 * Porta la cache DF (la rarità delle keyword, calcolata dall'indice) al motore DNA.
 *
 * PERCHÉ ESISTE QUESTO FILE. `dnaEngine` tiene `globalDfCache` come **stato di modulo** e la rarità
 * (`getSoftRarityMultiplier`) la legge quando il chiamante non passa una mappa. Se la variabile resta
 * `null`, la rarità **ricade in silenzio** sulle stime — nessun errore, nessun log: è la trappola che il
 * commento in `dnaEngine` avverte di non creare. Quindi la sincronizzazione è **esplicita** e va invocata
 * prima di ogni calcolo che tocca la rarità (il build del profilo e i percorsi che chiamano `computeFinalDNA`
 * fuori da un build).
 *
 * PERCHÉ NON È UNA CALLBACK. La prima versione (ticket 49) registrava un consumer push sull'indice: il profilo
 * importava un file interno dell'indice al caricamento e l'indice conosceva il profilo. La review l'ha
 * dichiarata sovra-ingegnerizzata e con il confine attraversato. Qui la direzione è quella giusta:
 * **il profilo legge la porta dell'indice**, e niente viene registrato a distanza.
 *
 * Idempotente: non sovrascrive una cache già presente.
 */

function sincronizzaDfCache() {
    try {
        const { getDfCache } = require('../indice');
        const { getGlobalDfCache, setGlobalDfCache } = require('./dnaEngine');
        const cached = typeof getDfCache === 'function' ? getDfCache() : null;
        if (cached && !getGlobalDfCache()) setGlobalDfCache(cached);
        return Boolean(cached);
    } catch (_e) {
        // Indice non caricato (o dump assente): la rarità usa le stime, come prima.
        return false;
    }
}

module.exports = { sincronizzaDfCache };
