/**
 * src/configurazione/door.js
 *
 * La porta del modulo configurazione utente (Ticket 26).
 * Possiede in via esclusiva il modello UserAccount e governa:
 * - Lettura raw dell'account (`accountDi`, `accountPerAddonUuid`)
 * - Risoluzione/ricerca account utente
 * - Gestione unificata delle credenziali e dello stato Trakt
 *   (`traktDi`, `segnaTraktInRinnovo`, `segnaTraktOk`, `segnaTraktDaRiautorizzare`, `segnaTraktDegradato`)
 * - Separazione della proprietà dei documenti (Decisione 6):
 *   Nessun file esterno al modulo deve manipolare direttamente UserAccount.
 */

const UserAccount = require('../models/UserAccount');

/**
 * Esegue l'aggiornamento dell'account rispettando le firme sia di updateOne che di findOneAndUpdate.
 * @private
 */
async function applicaAggiornamentoAccount(userId, updateOp, options = null) {
    if (!UserAccount) return null;
    try {
        const hasOptions = options && Object.keys(options).length > 0;
        if (hasOptions && options.returnDocument) {
            if (typeof UserAccount.findOneAndUpdate === 'function') {
                return await UserAccount.findOneAndUpdate({ userId }, updateOp, options);
            }
        }
        if (typeof UserAccount.updateOne === 'function') {
            return hasOptions
                ? await UserAccount.updateOne({ userId }, updateOp, options)
                : await UserAccount.updateOne({ userId }, updateOp);
        } else if (typeof UserAccount.findOneAndUpdate === 'function') {
            return hasOptions
                ? await UserAccount.findOneAndUpdate({ userId }, updateOp, options)
                : await UserAccount.findOneAndUpdate({ userId }, updateOp);
        }
    } catch (err) {
        // Degrado morbido su fallimento scrittura DB
        console.warn(`[Configurazione] Errore aggiornamento account ${userId}:`, err.message);
        return null;
    }
}

/**
 * La porta grezza: restituisce il documento account utente (lean).
 *
 * @param {string|Object} query - userId (stringa) oppure filtro MongoDB esplicito
 * @returns {Promise<Object|null>}
 */
async function accountDi(query) {
    if (!query) return null;
    if (!UserAccount || typeof UserAccount.findOne !== 'function') return null;

    try {
        const filter = typeof query === 'string' ? { userId: query } : query;
        const q = UserAccount.findOne(filter);
        return q && typeof q.lean === 'function' ? await q.lean() : await q;
    } catch (_err) {
        return null;
    }
}

/**
 * Restituisce l'account a partire dall'addonUuid univoco.
 *
 * @param {string} addonUuid
 * @returns {Promise<Object|null>}
 */
async function accountPerAddonUuid(addonUuid) {
    if (!addonUuid) return null;
    return accountDi({ addonUuid });
}

/**
 * Restituisce il conteggio totale degli account registrati.
 *
 * @returns {Promise<number>}
 */
async function contaAccount() {
    if (!UserAccount || typeof UserAccount.countDocuments !== 'function') return 0;
    try {
        return await UserAccount.countDocuments();
    } catch (_err) {
        return 0;
    }
}

/**
 * Cerca un account esistente per email o authKey di Stremio (usato dal login di auth).
 *
 * @param {Object} params
 * @param {string} [params.email]
 * @param {string} [params.stremioAuthKey]
 * @returns {Promise<Object|null>}
 */
async function trovaAccountPerEmailOAuthKey({ email = null, stremioAuthKey = null } = {}) {
    if (!UserAccount || typeof UserAccount.findOne !== 'function') return null;
    const conds = [];
    if (email) conds.push({ email });
    if (stremioAuthKey) conds.push({ 'apiKeys.stremio': stremioAuthKey });
    if (conds.length === 0) return null;

    try {
        const q = UserAccount.findOne({ $or: conds });
        return q && typeof q.lean === 'function' ? await q.lean() : await q;
    } catch (_err) {
        return null;
    }
}

/**
 * Restituisce le credenziali e lo stato di salute di Trakt in un blocco unico (Ticket 26, Decisione 5).
 * Applica il pattern del ripiego (read fallback):
 * Se `account.trakt` non è ancora popolato, legge dalla vecchia posizione (`account.apiKeys.trakt`, `account.traktStatus`).
 *
 * @param {string} userId
 * @returns {Promise<{accessToken: string|null, refreshToken: string|null, expiresAt: Date|null, status: Object}>}
 */
async function traktDi(userId) {
    if (!userId) return null;
    const account = await accountDi(userId);
    if (!account) return null;

    const t = account.trakt || {};
    const legacyKeys = account.apiKeys || {};
    const legacyStatus = account.traktStatus || {};

    const accessToken = t.accessToken || legacyKeys.trakt || null;
    const refreshToken = t.refreshToken || legacyKeys.traktRefreshToken || null;
    const expiresAt = t.expiresAt || legacyKeys.traktExpiresAt || null;

    let status = t.status;
    if (!status || !status.status || status.status === 'unknown') {
        status = legacyStatus.status ? legacyStatus : (status || { status: 'unknown' });
    }

    return {
        accessToken,
        refreshToken,
        expiresAt,
        status
    };
}

/**
 * Acquisisce il lock per l'avvio del refresh dei token Trakt (Decisione 5).
 *
 * @param {string} userId
 * @returns {Promise<any>}
 */
async function segnaTraktInRinnovo(userId) {
    const now = new Date();
    const update = {
        $set: {
            'trakt.status.refreshInProgress': true,
            'trakt.status.refreshLockedAt': now,
            // Fallback transizionale
            'traktStatus.refreshInProgress': true,
            'traktStatus.refreshLockedAt': now
        }
    };
    return applicaAggiornamentoAccount(userId, update);
}

/**
 * Marca lo stato di Trakt come 'ok' registrando l'orario e opzionalmente i nuovi token (Decisione 5).
 *
 * @param {string} userId
 * @param {Object} [tokens] - { accessToken, refreshToken, expiresAt }
 * @returns {Promise<any>}
 */
async function segnaTraktOk(userId, tokens = null) {
    const now = new Date();
    const setObj = {
        'trakt.status.status': 'ok',
        'trakt.status.refreshInProgress': false,
        'trakt.status.lastChecked': now,
        'trakt.status.lastSuccess': now,
        'trakt.status.lastError': null,
        'trakt.status.lastErrorAt': null,
        // Fallback transizionale
        'traktStatus.status': 'ok',
        'traktStatus.refreshInProgress': false,
        'traktStatus.lastChecked': now,
        'traktStatus.lastSuccess': now,
        'traktStatus.lastError': null,
        'traktStatus.lastErrorAt': null
    };

    if (tokens) {
        const acc = tokens.accessToken || tokens.access_token;
        const ref = tokens.refreshToken || tokens.refresh_token;
        const exp = tokens.expiresAt || tokens.expires_at;

        if (acc) {
            setObj['trakt.accessToken'] = acc;
            setObj['apiKeys.trakt'] = acc;
        }
        if (ref) {
            setObj['trakt.refreshToken'] = ref;
            setObj['apiKeys.traktRefreshToken'] = ref;
        }
        if (exp !== undefined) {
            const expDate = exp ? new Date(exp) : null;
            setObj['trakt.expiresAt'] = expDate;
            setObj['apiKeys.traktExpiresAt'] = expDate;
        }
    }

    return applicaAggiornamentoAccount(userId, { $set: setObj });
}

/**
 * Marca lo stato di Trakt come 'requires_reauth' con il motivo dell'errore (Decisione 5).
 *
 * @param {string} userId
 * @param {string} reason
 * @returns {Promise<any>}
 */
async function segnaTraktDaRiautorizzare(userId, reason) {
    const now = new Date();
    const update = {
        $set: {
            'trakt.status.status': 'requires_reauth',
            'trakt.status.refreshInProgress': false,
            'trakt.status.lastError': reason,
            'trakt.status.lastErrorAt': now,
            // Fallback transizionale
            'traktStatus.status': 'requires_reauth',
            'traktStatus.refreshInProgress': false,
            'traktStatus.lastError': reason,
            'traktStatus.lastErrorAt': now
        }
    };
    return applicaAggiornamentoAccount(userId, update);
}

/**
 * Marca lo stato di Trakt come 'degraded' con il motivo dell'errore (Decisione 5).
 *
 * @param {string} userId
 * @param {string} reason
 * @returns {Promise<any>}
 */
async function segnaTraktDegradato(userId, reason) {
    const now = new Date();
    const update = {
        $set: {
            'trakt.status.status': 'degraded',
            'trakt.status.refreshInProgress': false,
            'trakt.status.lastError': reason,
            'trakt.status.lastErrorAt': now,
            // Fallback transizionale
            'traktStatus.status': 'degraded',
            'traktStatus.refreshInProgress': false,
            'traktStatus.lastError': reason,
            'traktStatus.lastErrorAt': now
        }
    };
    return applicaAggiornamentoAccount(userId, update);
}

/**
 * Salva i token Trakt sincronizzati nel DB (Decisione 5).
 *
 * @param {string} userId
 * @param {Object} tokens - { accessToken, refreshToken, expiresAt }
 * @returns {Promise<any>}
 */
async function salvaTraktCredenziali(userId, { accessToken = null, refreshToken = null, expiresAt = null } = {}) {
    const updateSet = {
        'apiKeys.trakt': accessToken,
        'apiKeys.traktRefreshToken': refreshToken
    };
    if (expiresAt) {
        updateSet['apiKeys.traktExpiresAt'] = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
    }
    return applicaAggiornamentoAccount(userId, { $set: updateSet }, { returnDocument: 'after' });
}

/**
 * Marca lo stato di Trakt come non configurato.
 *
 * @param {string} userId
 * @returns {Promise<any>}
 */
async function segnaTraktNonConfigurato(userId) {
    const now = new Date();
    const update = {
        $set: {
            'trakt.status.status': 'not_configured',
            'trakt.status.lastChecked': now,
            'traktStatus.status': 'not_configured',
            'traktStatus.lastChecked': now
        }
    };
    return applicaAggiornamentoAccount(userId, update);
}

/**
 * Rimuove le credenziali Trakt dell'utente (disconnessione).
 *
 * @param {string} userId
 * @returns {Promise<any>}
 */
async function disconnettiTrakt(userId) {
    const update = {
        $unset: {
            'apiKeys.trakt': 1,
            'apiKeys.traktRefreshToken': 1,
            'apiKeys.traktExpiresAt': 1
        }
    };
    return applicaAggiornamentoAccount(userId, update, { returnDocument: 'after' });
}

module.exports = {
    accountDi,
    accountPerAddonUuid,
    contaAccount,
    trovaAccountPerEmailOAuthKey,
    traktDi,
    segnaTraktInRinnovo,
    segnaTraktOk,
    segnaTraktDaRiautorizzare,
    segnaTraktDegradato,
    segnaTraktNonConfigurato,
    salvaTraktCredenziali,
    disconnettiTrakt
};
