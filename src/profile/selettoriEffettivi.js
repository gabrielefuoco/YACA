/**
 * src/profile/selettoriEffettivi.js
 *
 * Risolutore puro dei selettori effettivi del profilo (Ticket 21).
 *
 * Pattern: `src/engines/profileStaleness.js` (funzione pura, deterministica,
 * senza I/O, senza orologio e senza dipendenze da database).
 *
 * I selettori di tipo (solo film / serie / anime / kidsMode) dipendono sia dalle
 * impostazioni salvate nel profilo, sia dalla richiesta corrente (es. Stremio o anteprima).
 * Il modulo profilo possiede la regola; i consumatori la applicano con la loro richiesta.
 */

const {
    ANIME_POLICY_MODES,
    getProfileAnimationQuota,
    getPolicyFromQuota
} = require('../anime');

/**
 * Risolve in modo puro i selettori effettivi per una data richiesta su un profilo.
 *
 * @param {object|null} [profilo] Profilo grezzo o TasteProfile
 * @param {object|null} [richiesta] Richiesta con eventuali override (typeSelectors, kidsMode, etc.)
 * @returns {object} Selettori effettivi normalizzati contenenti sempre la proprietà `anime`
 */
function selettoriEffettivi(profilo = null, richiesta = null) {
    const reqObj = (richiesta && typeof richiesta === 'object') ? richiesta : {};
    const profileObj = (profilo && typeof profilo === 'object') ? profilo : {};

    // 1. Estrazione selettori diretti dalla richiesta
    const requestSelectors = reqObj.typeSelectors && typeof reqObj.typeSelectors === 'object'
        ? reqObj.typeSelectors
        : {};

    // 2. Estrazione selettori salvati nel profilo
    const profileSelectors = profileObj.settings?.typeSelectors || profileObj.typeSelectors || {};

    // 3. Risoluzione KidsMode (la richiesta vince sul profilo)
    const isKidsMode = Boolean(
        reqObj.kidsMode !== undefined ? reqObj.kidsMode :
        reqObj.isKidsMode !== undefined ? reqObj.isKidsMode :
        profileObj.settings?.kidsMode !== undefined ? profileObj.settings.kidsMode :
        profileObj.kidsMode
    );

    // 4. Risoluzione politica anime
    let animePolicy;
    if (requestSelectors.anime) {
        animePolicy = requestSelectors.anime;
    } else if (profileSelectors.anime) {
        animePolicy = profileSelectors.anime;
    } else if (isKidsMode) {
        animePolicy = ANIME_POLICY_MODES.NEUTRAL;
    } else {
        const quota = getProfileAnimationQuota(profileObj);
        animePolicy = getPolicyFromQuota(quota);
    }

    // 5. Composizione risultato
    return {
        ...profileSelectors,
        ...requestSelectors,
        anime: animePolicy
    };
}

module.exports = {
    selettoriEffettivi
};
