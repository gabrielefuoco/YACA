/**
 * UserConfig Manager: Gestisce il caricamento e il salvataggio delle configurazioni utente.
 * 
 * Two-Table Split Architecture:
 *   - UserAccount: Stores secrets (auth credentials, API keys, addonUuid)
 *   - AddonConfig: Stores public Stremio config (profiles, catalogs, DNA, syncStatus)
 * 
 * The join is strictly unidirectional: UserAccount.addonUuid → AddonConfig.uuid.
 * AddonConfig is 100% anonymous — it has NO userId field.
 */

const { nanoid } = require('nanoid');
const AddonConfig = require('../db/models/AddonConfig');
const UserAccount = require('../db/models/UserAccount');
const { encryptIfNeeded, decryptSafe } = require('../utils/encryption');

const UserConfig = {
    _decryptApiKeys(apiKeysObj) {
        if (!apiKeysObj) return {};
        const decrypted = {};
        for (const [key, value] of Object.entries(apiKeysObj)) {
            decrypted[key] = decryptSafe(value);
        }
        return decrypted;
    },
    
    /**
     * Salva o aggiorna un utente nel database (Two-Table Split).
     * 
     * Step 1: Upsert UserAccount with auth credentials + API keys.
     * Step 2: Resolve addonUuid from UserAccount.
     * Step 3: Upsert AddonConfig with profiles + config.
     * 
     * Implements Optimistic Concurrency Control (OCC) via configVersion.
     * @param {object} userData - Dati dell'utente da aggiornare
     * @returns {Promise<object>} Merged view of both tables
     */
    async saveUser(userData) {
        const MAX_RETRIES = 3;
        let attempt = 0;

        while (attempt < MAX_RETRIES) {
            try {
                let targetUserId = userData.userId;

                // 1. Ensure userId exists and is a string
                if (!targetUserId) {
                    targetUserId = nanoid(10);
                } else if (typeof targetUserId !== 'string') {
                    throw new Error("userId non valido");
                }

                // 2. READ EXISTING DATA FROM BOTH TABLES
                const existingAccount = await UserAccount.findOne({ userId: targetUserId });
                const existingAddonUuid = existingAccount?.addonUuid;
                const existingConfig = existingAddonUuid
                    ? await AddonConfig.findOne({ uuid: existingAddonUuid }).lean()
                    : null;

                // Check for OCC conflicts against AddonConfig's configVersion
                if (existingConfig) {
                    if (userData.config?.configVersion && 
                        existingConfig.config?.configVersion && 
                        userData.config.configVersion !== existingConfig.config?.configVersion) {
                        console.warn(`[UserConfig] Concurrency conflict for ${targetUserId}. Incoming: ${userData.config.configVersion}, DB: ${existingConfig.config.configVersion}`);
                        attempt++;
                        if (attempt >= MAX_RETRIES) throw new Error("Conflitto di versione: impossibile salvare le modifiche");
                        continue; 
                    }
                }

                // 3. MERGE DATA & PREPARE UPDATES
                const keysToUnset = new Set();
                if (existingAccount) {
                    const incomingApiKeys = userData.apiKeys || {};
                    const currentApiKeys = existingAccount.apiKeys?.toObject?.() || existingAccount.apiKeys || {};
                    const mergedApiKeys = { ...currentApiKeys };

                    for (const [key, value] of Object.entries(incomingApiKeys)) {
                        if (value === null || value === '') {
                            delete mergedApiKeys[key];
                            keysToUnset.add(key);
                        } else if (value !== undefined) {
                            mergedApiKeys[key] = value;
                        }
                    }
                    userData.apiKeys = mergedApiKeys;
                    if (!userData.email && existingAccount.email) userData.email = existingAccount.email;
                }

                // Prepare finalized profiles list (Synchronized Merge)
                let finalizedProfiles = existingConfig?.profiles || [];
                if (Array.isArray(userData.profiles)) {
                    const existingProfileMap = new Map(
                        (existingConfig?.profiles || []).map(p => [p.id || p._id?.toString(), p])
                    );

                    finalizedProfiles = userData.profiles.map(incoming => {
                        const pId = incoming.id || incoming._id?.toString();
                        const existing = existingProfileMap.get(pId);
                        
                        // If it's a new profile, use as is
                        if (!existing) return incoming;

                        // If it's an existing profile, merge carefully
                        const mergedSettings = { 
                            ...(existing.settings || {}), 
                            ...(incoming.settings || {}) 
                        };
                        
                        // Preserve DNA if missing in incoming payload (server-side only fields)
                        if (existing.settings?.manualDNA?.length && (!incoming.settings?.manualDNA || incoming.settings.manualDNA.length === 0)) {
                            mergedSettings.manualDNA = existing.settings.manualDNA;
                        }
                        if (existing.settings?.suggestedDNA?.length && (!incoming.settings?.suggestedDNA || incoming.settings.suggestedDNA.length === 0)) {
                            mergedSettings.suggestedDNA = existing.settings.suggestedDNA;
                        }

                        return { 
                            ...existing, 
                            ...incoming, 
                            catalogs: incoming.catalogs || existing.catalogs || [],
                            raw_ui_state: incoming.raw_ui_state || existing.raw_ui_state || {},
                            settings: mergedSettings,
                            // CRITICAL: Always preserve DNA scores (server-calculated)
                            dna: existing.dna || incoming.dna 
                        };
                    });
                }

                // Merge Config (version bump on every save)
                const existingConfigObj = existingConfig?.config || {};
                userData.config = {
                    ...existingConfigObj,
                    ...(userData.config || {}),
                    configVersion: nanoid(8)
                };

                userData.userId = targetUserId;

                // ============================================
                // TABLE A: UserAccount (secrets vault)
                // ============================================
                const accountUpdate = { $set: {} };
                const accountUnset = {};

                if (userData.email) accountUpdate.$set.email = userData.email;

                if (userData.apiKeys) {
                    const keysInDoc = ['stremio', 'tmdb', 'mistral', 'trakt', 'traktRefreshToken'];
                    keysInDoc.forEach(k => {
                        if (keysToUnset.has(k)) {
                            accountUnset[`apiKeys.${k}`] = 1;
                        } else {
                            const val = userData.apiKeys[k];
                            if (val !== undefined) {
                                accountUpdate.$set[`apiKeys.${k}`] = encryptIfNeeded(val);
                            }
                        }
                    });
                }

                if (Object.keys(accountUnset).length > 0) accountUpdate.$unset = accountUnset;
                if (Object.keys(accountUpdate.$set).length === 0) delete accountUpdate.$set;

                const accountDoc = await UserAccount.findOneAndUpdate(
                    { userId: targetUserId },
                    accountUpdate,
                    { 
                        returnDocument: 'after', 
                        upsert: true,
                        setDefaultsOnInsert: true,
                        runValidators: true
                    }
                );

                if (!accountDoc) throw new Error("Errore creazione UserAccount");

                // ============================================
                // TABLE B: AddonConfig (public, anonymous)
                // ============================================
                const targetUuid = accountDoc.addonUuid;
                const configUpdateOp = { $set: {} };

                // Config fields
                if (userData.config) {
                    for (const [k, v] of Object.entries(userData.config)) {
                        configUpdateOp.$set[`config.${k}`] = v;
                    }
                }

                // Set profiles directly (synchronized)
                configUpdateOp.$set.profiles = finalizedProfiles;

                if (Object.keys(configUpdateOp.$set).length === 0) delete configUpdateOp.$set;

                // OCC query: match version if existing config exists
                const configQuery = { uuid: targetUuid };
                if (existingConfig) {
                    configQuery['config.configVersion'] = existingConfig.config?.configVersion;
                }

                const updatedConfig = await AddonConfig.findOneAndUpdate(
                    configQuery,
                    configUpdateOp,
                    { 
                        returnDocument: 'after', 
                        upsert: !existingConfig,
                        setDefaultsOnInsert: true,
                        runValidators: true
                    }
                );

                if (!updatedConfig && existingConfig) {
                    // Version changed between read and write — retry
                    attempt++;
                    if (attempt >= MAX_RETRIES) throw new Error("Conflitto di versione persistente: impossibile salvare");
                    continue;
                }

                // Return a merged view compatible with the rest of the app
                return this._mergeView(accountDoc, updatedConfig);
            } catch (err) {
                if (attempt >= MAX_RETRIES - 1) {
                    console.error(`[UserConfig] Errore salvataggio definitivo utente ${userData?.userId}:`, err.message);
                    throw err;
                }
                attempt++;
            }
        }
    },

    /**
     * Helper per risolvere la configurazione utente (Stateful).
     * Supports lookup by userId or by addon UUID.
     * Reads public config from AddonConfig and joins API keys from UserAccount.
     * @param {string} handle - userId or addon UUID
     * @returns {Promise<object|null>} Configurazione utente normalizzata
     */
    async resolveUserConfig(handle) {
        if (!handle) return null;

        // Try UUID-based lookup (AddonConfig table) first
        const addonConfig = await AddonConfig.findOne({ uuid: handle }).lean().catch(() => null);
        if (addonConfig) {
            const account = await UserAccount.findOne({ addonUuid: handle }).lean().catch(() => null);
            return this._buildResolvedConfig(account, addonConfig);
        }

        // Try userId-based lookup
        const account = await UserAccount.findOne({ userId: handle }).lean().catch(() => null);
        if (account?.addonUuid) {
            const config = await AddonConfig.findOne({ uuid: account.addonUuid }).lean().catch(() => null);
            return this._buildResolvedConfig(account, config);
        }

        return null;
    },

    /**
     * Builds a normalized config object from UserAccount + AddonConfig.
     * @private
     */
    _buildResolvedConfig(account, addonConfig) {
        const resolvedProfiles = (addonConfig?.profiles || []).map(p => ({
            ...p,
            id: p.id || p._id?.toString()
        }));

        return {
            userId: account?.userId || null,
            addonUuid: addonConfig?.uuid || account?.addonUuid || null,
            apiKeys: this._decryptApiKeys(account?.apiKeys?.toObject?.() || account?.apiKeys || {}),
            profiles: resolvedProfiles,
            activeProfileId: addonConfig?.config?.activeProfileId,
            configVersion: addonConfig?.config?.configVersion,
            syncStatus: addonConfig?.syncStatus
        };
    },

    /**
     * Creates a merged view from both table documents for backwards compatibility.
     * @private
     */
    _mergeView(accountDoc, configDoc) {
        const accountObj = accountDoc?.toObject?.() || accountDoc || {};
        const configObj = configDoc?.toObject?.() || configDoc || {};
        return {
            userId: accountObj.userId,
            email: accountObj.email,
            addonUuid: accountObj.addonUuid,
            apiKeys: this._decryptApiKeys(accountObj.apiKeys || {}),
            profiles: configObj.profiles || [],
            config: configObj.config || {},
            syncStatus: configObj.syncStatus || {}
        };
    }
};

module.exports = UserConfig;
