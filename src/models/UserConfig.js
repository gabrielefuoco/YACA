/**
 * UserConfig Manager: Gestisce il caricamento e il salvataggio delle configurazioni utente.
 * Supporta sia il nuovo modello stateful (MongoDB via userId) che il vecchio stateless (Base64).
 */

const { nanoid } = require('nanoid');
const User = require('./User');

const UserConfig = {
    /**
     * Carica un utente dal database MongoDB tramite il suo ID corto.
     * @param {string} userId - ID univoco dell'utente
     * @returns {Promise<object|null>} Il documento utente o null
     */
    async getUser(userId) {
        try {
            if (typeof userId !== 'string') return null;
            return await User.findOne({ userId });
        } catch (err) {
            console.error(`Errore caricamento utente ${userId}:`, err.message);
            return null;
        }
    },

    /**
     * Salva o aggiorna un utente nel database.
     * Implementa Optimistic Concurrency Control (OCC) per evitare sovrascritture accidentali.
     * @param {object} userData - Dati dell'utente da aggiornare
     * @returns {Promise<object>} Il documento salvato
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

                // 2. DATA PRESERVATION & MERGING
                const existingUser = await this.getUser(targetUserId);
                if (existingUser) {
                    // Check for conflicts if configVersion is provided
                    if (userData.config?.configVersion && 
                        existingUser.config?.configVersion && 
                        userData.config.configVersion !== existingUser.config.configVersion) {
                        console.warn(`[UserConfig] Concurrency conflict for ${targetUserId}. Incoming: ${userData.config.configVersion}, DB: ${existingUser.config.configVersion}`);
                        // If we are far behind, we should probably fail or reload. 
                        // For now, increment attempt and retry (the next loop will use fresh existingUser).
                        attempt++;
                        if (attempt >= MAX_RETRIES) throw new Error("Conflitto di versione: impossibile salvare le modifiche");
                        continue; 
                    }

                    // Merge Profiles (preserving pending suggestions if not provided)
                    if (!userData.profiles?.length && existingUser.profiles?.length) {
                        userData.profiles = existingUser.profiles;
                    } else if (Array.isArray(userData.profiles) && existingUser.profiles?.length) {
                        const existingProfiles = new Map(
                            existingUser.profiles.map((p) => [p.id, p.toObject?.() || p])
                        );
                        userData.profiles = userData.profiles.map((profile) => {
                            const existingProfile = existingProfiles.get(profile.id);
                            if (!existingProfile) return profile;
                            return profile;
                        });
                    }

                    // Merge API Keys
                    const incomingApiKeys = userData.apiKeys || {};
                    const currentApiKeys = existingUser.apiKeys?.toObject?.() || existingUser.apiKeys || {};
                    const mergedApiKeys = { ...currentApiKeys, ...incomingApiKeys };

                    /*
                    // Handle null/empty deletes
                    for (const [key, value] of Object.entries(incomingApiKeys)) {
                        if (value === null || value === '') {
                            delete mergedApiKeys[key];
                        }
                    }
                    */
                    userData.apiKeys = mergedApiKeys;

                    // Preserve fields if not provided
                    if (!userData.email && existingUser.email) userData.email = existingUser.email;
                    
                    // Merge Config
                    userData.config = {
                        ...existingUser.config?.toObject?.() || existingUser.config,
                        ...(userData.config || {}),
                        configVersion: nanoid(8) // Increment version on every save
                    };
                } else {
                    // New user initialization
                    if (!userData.config) userData.config = {};
                    userData.config.configVersion = nanoid(8);
                }

                userData.userId = targetUserId;

                // 3. ATOMIC UPDATE WITH GRANULAR MERGING
                const updateOperation = { $set: {} };
                const unsetFields = {};

                if (userData.email) updateOperation.$set.email = userData.email;
                if (userData.config) {
                    for (const [k, v] of Object.entries(userData.config)) {
                        updateOperation.$set[`config.${k}`] = v;
                    }
                }

                if (Array.isArray(userData.profiles)) {
                    if (!existingUser || !existingUser.profiles?.length) {
                        updateOperation.$set.profiles = userData.profiles;
                    } else {
                        const profileMap = new Map(existingUser.profiles.map(p => [p.id, p.toObject?.() || p]));
                        userData.profiles.forEach(p => {
                            const existing = profileMap.get(p.id);
                            if (existing) {
                                const mergedSettings = { ...(existing.settings || {}), ...(p.settings || {}) };
                                profileMap.set(p.id, { ...existing, ...p, settings: mergedSettings });
                            } else {
                                profileMap.set(p.id, p);
                            }
                        });
                        updateOperation.$set.profiles = Array.from(profileMap.values());
                    }
                }

                if (userData.apiKeys) {
                    const keysInDoc = ['stremio', 'tmdb', 'mistral', 'trakt', 'traktRefreshToken', 'mdblist'];
                    keysInDoc.forEach(k => {
                        const val = userData.apiKeys[k];
                        if (val === null || val === '') {
                            unsetFields[`apiKeys.${k}`] = 1;
                        } else if (val !== undefined) {
                            updateOperation.$set[`apiKeys.${k}`] = val;
                        }
                    });
                }

                if (Object.keys(unsetFields).length > 0) updateOperation.$unset = unsetFields;
                if (Object.keys(updateOperation.$set).length === 0) delete updateOperation.$set;

                // 4. ATOMIC SAVE WITH VERSION CHECK
                const query = { userId: targetUserId };
                if (existingUser) {
                    // Optimized: only update if the version matches what we read
                    query['config.configVersion'] = existingUser.config?.configVersion;
                }

                const updatedUser = await User.findOneAndUpdate(
                    query,
                    updateOperation,
                    { 
                        returnDocument: 'after', 
                        upsert: !existingUser, // Only upsert if it's a new user
                        setDefaultsOnInsert: true,
                        runValidators: true
                    }
                );

                if (!updatedUser) {
                    // If no user found with this query, it means the version changed in between read and write
                    attempt++;
                    if (attempt >= MAX_RETRIES) throw new Error("Conflitto di versione persistente: impossibile salvare");
                    continue;
                }

                return updatedUser;
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
     * @param {string} userId - userId (MongoDB)
     * @returns {Promise<object|null>} Configurazione utente normalizzata
     */
    async resolveUserConfig(userId) {
        if (!userId) return null;

        const user = await this.getUser(userId);
        if (user) {
            return {
                userId: user.userId,
                apiKeys: user.apiKeys,
                profiles: user.profiles,
                activeProfileId: user.config?.activeProfileId,
                configVersion: user.config?.configVersion
            };
        }

        return null;
    }
};

module.exports = UserConfig;
