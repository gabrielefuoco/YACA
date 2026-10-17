// src/catalog/previewContract.js

/**
 * CONTRATTO DELL'ANTEPRIMA CATALOGO (Ticket 23).
 *
 * "Il contratto dell'anteprima è nel tipo, i numeri nel servire."
 *
 * Il modulo dichiara COSA un'anteprima deve rispondere:
 * - Le card (titolo, poster, anno, badge ita, durata, voto) con cap a 20
 * - La FORMA della diagnosi (candidati, entrati, tagliati per filtro)
 *
 * I numeri (conteggi e ragioni dello scarto) li produce il servire nella rotta
 * di anteprima (src/api/configurazione.js), che è l'unico che sa perché un titolo
 * è stato scartato.
 */

const PREVIEW_CAP = 20;

const DEFAULT_TAGLIATI_SHAPE = Object.freeze({
    ita: 0,
    kids: 0,
    genere: 0,
    gia_visto: 0,
    qualita: 0,
    collezioni: 0
});

/**
 * Formatta la risposta di anteprima secondo il contratto canonico.
 *
 * @param {Object} params
 * @param {string|null} [params.name]
 * @param {string} [params.type]
 * @param {Array<Object>} [params.cards]
 * @param {Object} [params.diagnosi]
 * @param {number} [params.total]
 * @returns {Object} Risposta conforme al contratto
 */
function formatPreviewResponse({
    name = null,
    type = 'movie',
    cards = [],
    diagnosi = {},
    total = null
} = {}) {
    const rawCards = Array.isArray(cards) ? cards : [];
    const cappedCards = rawCards.slice(0, PREVIEW_CAP).map(card => {
        const id = String(card.id || '');
        const titolo = card.titolo || card.title || card.name || '';
        const anno = card.anno || card.year || (card.releaseInfo ? String(card.releaseInfo).substring(0, 4) : '');
        const durata = card.durata ?? card.duration ?? card.runtime ?? null;
        const badgeIta = Boolean(card.badgeIta || card.tlBadge || card.isDubbed || (titolo && titolo.includes('[ITA]')));
        const poster = card.poster || null;
        const voto = Number(card.voto ?? card.vote_average ?? card.imdbRating ?? 0);
        const cardType = card.type || type;

        return {
            id,
            titolo,
            title: titolo,
            poster,
            anno,
            year: anno,
            badgeIta,
            durata,
            duration: durata,
            voto,
            type: cardType
        };
    });

    const entrati = cappedCards.length;
    const candidati = typeof diagnosi?.candidati === 'number'
        ? diagnosi.candidati
        : Math.max(rawCards.length, entrati);

    const tagliati = {
        ...DEFAULT_TAGLIATI_SHAPE,
        ...(diagnosi?.tagliati || {})
    };

    const formattedDiagnosis = {
        candidati,
        entrati,
        tagliati
    };

    return {
        name: name ? String(name).trim() : null,
        type: type === 'series' || type === 'tv' ? 'tv' : 'movie',
        items: cappedCards,
        cards: cappedCards,
        diagnosi: formattedDiagnosis,
        total: total !== null && total !== undefined ? total : entrati
    };
}

/**
 * Valida che una risposta rispetti il contratto dell'anteprima.
 *
 * @param {Object} res
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validatePreviewResponse(res) {
    const errors = [];
    if (!res || typeof res !== 'object') {
        return { valid: false, errors: ['La risposta di anteprima deve essere un oggetto.'] };
    }

    if (!Array.isArray(res.cards)) {
        errors.push('La risposta deve contenere un array "cards".');
    } else if (res.cards.length > PREVIEW_CAP) {
        errors.push(`Il numero di card supera il cap massimo consentito di ${PREVIEW_CAP} (ricevute ${res.cards.length}).`);
    } else {
        for (let i = 0; i < res.cards.length; i++) {
            const c = res.cards[i];
            if (!c.id) errors.push(`Card all'indice ${i} priva di "id".`);
            if (!c.title && !c.titolo) errors.push(`Card all'indice ${i} priva di "titolo"/"title".`);
        }
    }

    if (!res.diagnosi || typeof res.diagnosi !== 'object') {
        errors.push('La risposta deve contenere l\'oggetto "diagnosi".');
    } else {
        if (typeof res.diagnosi.candidati !== 'number') {
            errors.push('diagnosi.candidati deve essere un numero.');
        }
        if (typeof res.diagnosi.entrati !== 'number') {
            errors.push('diagnosi.entrati deve essere un numero.');
        }
        if (!res.diagnosi.tagliati || typeof res.diagnosi.tagliati !== 'object') {
            errors.push('diagnosi.tagliati deve essere un oggetto.');
        }
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

module.exports = {
    PREVIEW_CAP,
    DEFAULT_TAGLIATI_SHAPE,
    formatPreviewResponse,
    validatePreviewResponse
};
