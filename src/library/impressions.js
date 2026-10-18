/**
 * src/library/impressions.js
 *
 * Registrazione delle impressioni dei titoli serviti nelle raccomandazioni.
 * Instradata attraverso la porta di dominio src/profile (Ticket 41 - Step 6).
 */

function registraImpressioni(userId, context, catalogId, items) {
    const profile = require('../profile');
    if (typeof profile.registraImpressioni === 'function') {
        return profile.registraImpressioni(userId, context, catalogId, items);
    }
}

module.exports = {
    registraImpressioni
};

