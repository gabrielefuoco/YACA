const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Versione del disegno del badge.
 * Sostituisce il numero manuale (24) con un hash derivato dal contenuto dell'asset del badge
 * (la font con cui si compone l'immagine).
 * Cambia automaticamente quando cambia l'asset grafico, in questo punto solo (ticket 30, sessione 2).
 */
function calcolaVersioneDisegno() {
    try {
        const fontPath = path.join(__dirname, '../../assets/fonts/noto-sans.ttf');
        if (fs.existsSync(fontPath)) {
            const fontBytes = fs.readFileSync(fontPath);
            return crypto.createHash('sha1').update(fontBytes).digest('hex').slice(0, 8);
        }
    } catch {
        // Fallback di sicurezza
    }
    return crypto.createHash('sha1').update('noto-sans-badge-v1').digest('hex').slice(0, 8);
}

const BADGE_IMG_VERSION = calcolaVersioneDisegno();

/**
 * Versione del poster composto specifico: dipende dal disegno (BADGE_IMG_VERSION),
 * dall'identificatore del titolo (id ERDB) e dal badge testuale.
 *
 * NON dipende dall'immagine sorgente, e non e' una dimenticanza: la sorgente e' un
 * URL che solo l'app conosce (il poster dell'item), mentre il nome del file lo devono
 * saper calcolare **entrambi i lati** — l'app e il dump offline di `scripts/erdb-builder`.
 * Se la versione dipendesse dalla sorgente, il dump produrrebbe nomi che l'app non
 * chiede, e la precomposizione dei poster con badge sarebbe lavoro sprecato.
 *
 * Cosa non copre, di conseguenza: un cambio del poster **alla sorgente** a parita' di
 * `erdbId` e badge non invalida il composto. E' lo stesso comportamento dei poster nudi
 * (che non hanno versione affatto), quindi il sistema e' coerente con se stesso.
 */
function calcolaVersionePoster({ erdbId, badge } = {}) {
    return crypto.createHash('sha1')
        .update(`${BADGE_IMG_VERSION}|${erdbId || ''}|${badge || ''}`)
        .digest('hex')
        .slice(0, 8);
}

module.exports = {
    BADGE_IMG_VERSION,
    calcolaVersionePoster,
    calcolaVersioneDisegno
};


