/**
 * src/profile/context.js
 *
 * Resolver del contesto unico del profilo (Ticket 21).
 *
 * Produce l'oggetto di contesto che scende a tutti i consumatori:
 * { userId, profileId, addonUuid, selettoriEffettivi, kidsMode, slider }
 *
 * Risolve i selettori al bordo della richiesta in modo che pool, catalogHandler
 * e cache ricevano la medesima istanza senza divergenze per costruzione.
 */

const { accountDi, accountPerAddonUuid } = require('../configurazione');
const { profiloDi, risolviProfiloAttivo } = require('./door');
const { selettoriEffettivi } = require('./selettoriEffettivi');
const {
    modiAbilitati,
    leggiModoAttivo,
    derivaLeve,
    selettoriDaLeve,
    opzioniGrafoDi,
    isModoValido
} = require('./modo');

/**
 * Risolve il contesto completo del profilo.
 *
 * @param {{
 *   userId?: string|null,
 *   profileId?: string|null,
 *   addonUuid?: string|null,
 *   richiesta?: object|null,
 *   user?: object|null
 * }} input
 * @returns {Promise<{
 *   userId: string|null,
 *   profileId: string,
 *   addonUuid: string|null,
 *   selettoriEffettivi: object,
 *   kidsMode: boolean,
 *   slider: object
 * }>}
 */
async function contestoDi(input = {}) {
    const { userId, profileId, addonUuid, richiesta, user } = input || {};

    let resolvedUserId = userId || user?.userId || null;
    let resolvedAddonUuid = addonUuid || user?.addonUuid || null;

    if (!resolvedAddonUuid && resolvedUserId) {
        try {
            const account = await accountDi(resolvedUserId);
            if (account?.addonUuid) {
                resolvedAddonUuid = account.addonUuid;
            }
        } catch (_err) {}
    } else if (!resolvedUserId && resolvedAddonUuid) {
        try {
            const account = await accountPerAddonUuid(resolvedAddonUuid);
            if (account?.userId) {
                resolvedUserId = account.userId;
            }
        } catch (_err) {}
    }

    // Lettura del profilo grezzo
    const rawProfile = await profiloDi({
        userId: resolvedUserId,
        profileId: profileId || undefined,
        addonUuid: resolvedAddonUuid
    });

    const resolvedProfileId = (profileId && String(profileId).trim())
        || rawProfile?.id
        || 'global';

    // Con `MODI_ABILITATI` acceso le leve NON si leggono più dalle impostazioni del
    // profilo: sono uscite di `derivaLeve(modo)`. La richiesta non può sovrascriverle
    // (un `kidsMode` di query sarebbe una seconda fonte di verità).
    const modoAttivo = modiAbilitati()
        ? (user
            ? leggiModoAttivo(user)
            : (isModoValido(rawProfile?.modo) ? rawProfile.modo : leggiModoAttivo(rawProfile)))
        : null;
    const leve = modoAttivo ? derivaLeve(modoAttivo) : null;

    // Calcolo kidsMode (con il flag acceso vince la modalità)
    const kidsMode = leve
        ? leve.kids
        : Boolean(
            richiesta?.kidsMode !== undefined ? richiesta.kidsMode :
            richiesta?.isKidsMode !== undefined ? richiesta.isKidsMode :
            rawProfile?.settings?.kidsMode
        );

    // Calcolo slider del motore: la richiesta (anteprima) resta sovrana, poi i
    // cursori d'account, poi le preferenze salvate nel profilo.
    const slider = (richiesta?.sliders || richiesta?.slider)
        || (modoAttivo ? opzioniGrafoDi(user || rawProfile, rawProfile) : null)
        || rawProfile?.settings?.sliders
        || rawProfile?.settings?.slider
        || rawProfile?.sliders
        || {};

    // Calcolo dei selettori effettivi tramite funzione pura del modulo
    const resolvedSelectors = leve
        ? selettoriDaLeve(leve)
        : selettoriEffettivi(rawProfile, {
            ...(richiesta || {}),
            kidsMode
        });

    return {
        userId: resolvedUserId,
        profileId: resolvedProfileId,
        addonUuid: resolvedAddonUuid,
        selettoriEffettivi: resolvedSelectors,
        kidsMode,
        // UN nome solo in uscita (`sliders`): l'alias `slider` resta accettato IN INGRESSO (i profili
        // salvati col nome vecchio devono continuare a funzionare), ma esporne due in uscita
        // significa lasciare al chiamante la scelta di quale leggere — ed e' come si crea la
        // catena `ctx.sliders || ctx.slider` che trovi nei consumatori.
        sliders: slider,
        // La modalità viaggia nel contesto solo con il flag acceso: il resto dei
        // consumatori non la conosce (e con il flag spento l'oggetto è identico a prima).
        ...(modoAttivo ? { modo: modoAttivo, leve } : {})
    };
}

const LEGACY_HERO_IDS = new Set([
    'yaca_mondi_movies', 'yaca_mondi_series',
    'yaca_passo_fuori_movies', 'yaca_passo_fuori_series',
    'yaca_uscite_nuove_movies', 'yaca_uscite_nuove_series',
    'yaca_nicchia_di_qualita_movies', 'yaca_nicchia_di_qualita_series',
    'yaca_classici_movies', 'yaca_classici_series',
    'yaca_ultime_visioni_movies', 'yaca_ultime_visioni_series',
    'yaca_punti_incontro_movies', 'yaca_punti_incontro_series',
    'yaca_micro_cluster_1_movies', 'yaca_micro_cluster_1_series',
    'yaca_micro_cluster_2_movies', 'yaca_micro_cluster_2_series',
    'yaca_micro_cluster_3_movies', 'yaca_micro_cluster_3_series'
]);

/**
 * Filtra silenziosamente i dieci ID hero legacy da un array selectedPresets (Task 6).
 * Se il profilo contiene solo vecchi ID, non va in crash e non resuscita i ruoli legacy.
 */
function ignoraPresetLegacy(presets) {
    if (!Array.isArray(presets)) return [];
    return presets.filter(id => typeof id === 'string' && !LEGACY_HERO_IDS.has(id));
}

module.exports = {
    contestoDi,
    risolviContesto: contestoDi,
    ignoraPresetLegacy,
    LEGACY_HERO_IDS
};
