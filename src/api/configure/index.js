const UserConfig = require('../../models/UserConfig');
const UserList = require('../../models/UserList');
const { resolveHostUrl } = require('../../utils/helpers');
const { validateAuth, validateKeys } = require('./validators');
const { processProfiles, createGlobalProfileInput } = require('./profileProcessor');
const { updateStremioAddonCollection } = require('../../utils/stremioAddonSync');
const UserAccount = require('../../db/models/UserAccount');
const AddonConfig = require('../../db/models/AddonConfig');

module.exports = async (req, res) => {
    try {
        validateAuth(req);

        const { activeProfileId, profiles: bodyProfiles } = req.body;
        const userId = req.user.userId;
        const existingUser = await UserConfig.getUser(userId);

        const warnings = [];
        const {
            effectiveTmdbKey, // not used directly here but validated
            mistralKey,
            traktToken,
            traktRefreshToken,
            mdblistKey,
            stremioAuthKey,
            stremioEmail
        } = validateKeys(req.body, existingUser, warnings);

        let parsedProfiles = undefined;

        // Process profiles only if provided
        if (req.body.profiles || req.body.selectedPresets || req.body.prompts) {
            let inputProfiles = bodyProfiles || [];
            if (inputProfiles.length === 0) {
                inputProfiles = [{
                    id: 'global',
                    name: 'Generale',
                    selectedPresets: req.body.selectedPresets || [],
                    existingCatalogs: [],
                    newPrompts: req.body.prompts || []
                }];
            }

            if (!inputProfiles.some(p => p.id === 'global')) {
                inputProfiles = [createGlobalProfileInput(), ...inputProfiles];
            }

            parsedProfiles = await processProfiles(inputProfiles, userId, mistralKey, warnings);
        }

        const finalActiveProfileId = (activeProfileId && parsedProfiles?.some(p => p.id === activeProfileId))
            ? activeProfileId
            : (parsedProfiles?.some(p => p.id === 'global') ? 'global' : (parsedProfiles?.[0]?.id || existingUser?.config?.activeProfileId || 'global'));



        const updateData = {
            userId,
            config: {
                activeProfileId: finalActiveProfileId
            }
        };

        // Prepare API Keys for update using VALIDATED values from validateKeys(),
        // NOT raw req.body values. This prevents empty strings from overwriting
        // valid tokens stored in the DB (Bug 1.1: Token Invalidation).
        const apiKeys = {};
        let hasApiKeys = false;

        // Map validated key names to DB field names
        const validatedKeyMap = {
            effectiveTmdbKey: 'tmdb',
            mistralKey: 'mistral',
            traktToken: 'trakt',
            traktRefreshToken: 'traktRefreshToken',
            mdblistKey: 'mdblist',
            stremioAuthKey: 'stremio'
        };

        // Only include keys that were explicitly provided in the request body
        // and have a non-empty validated value. Ignore empty/undefined values
        // to prevent accidental overwrite of existing DB tokens.
        const validatedValues = { effectiveTmdbKey, mistralKey, traktToken, traktRefreshToken, mdblistKey, stremioAuthKey };
        for (const [validatedName, dbKey] of Object.entries(validatedKeyMap)) {
            const value = validatedValues[validatedName];
            if (value !== undefined && value !== null && value !== '') {
                apiKeys[dbKey] = value;
                hasApiKeys = true;
            }
        }

        if (hasApiKeys) updateData.apiKeys = apiKeys;
        if (parsedProfiles !== undefined) updateData.profiles = parsedProfiles;
        if (stremioEmail) updateData.email = stremioEmail;

        const userDoc = await UserConfig.saveUser(updateData);

        // Two-Table Sync: Mirror data into UserAccount + AddonConfig (Phase 0.1)
        // UserAccount gets API keys; AddonConfig gets profiles & config.
        const accountUpdate = {};
        if (hasApiKeys) accountUpdate.apiKeys = apiKeys;
        if (stremioEmail) accountUpdate.email = stremioEmail;

        if (Object.keys(accountUpdate).length > 0) {
            try {
                await UserAccount.findOneAndUpdate(
                    { userId },
                    { $set: accountUpdate, $setOnInsert: { userId } },
                    { upsert: true }
                );
            } catch (err) {
                console.error('[TwoTableSync] UserAccount sync error:', err.message);
            }
        }

        const configUpdate = {};
        if (parsedProfiles !== undefined) configUpdate.profiles = parsedProfiles;
        configUpdate.config = { activeProfileId: finalActiveProfileId, configVersion: userDoc.config?.configVersion };

        // Get or create the addon UUID for this user
        let addonUuid;
        try {
            const account = await UserAccount.findOne({ userId }).lean();
            addonUuid = account?.addonUuid;
        } catch (_e) { /* ignore */ }

        if (addonUuid) {
            try {
                await AddonConfig.findOneAndUpdate(
                    { uuid: addonUuid },
                    { $set: configUpdate },
                    { upsert: true }
                );
            } catch (err) {
                console.error('[TwoTableSync] AddonConfig sync error:', err.message);
            }
        }

        // Cleanup unreferenced lists
        if (parsedProfiles) {
            const referencedIds = new Set(parsedProfiles.flatMap(p => p.catalogs.map(c => String(c.id))));
            await UserList.deleteMany({
                owner: userId,
                sourceType: { $in: ['ai_prompt', 'manual_filter'] },
                listId: { $nin: Array.from(referencedIds) }
            });
        }

        const hostUrl = resolveHostUrl(req);
        const manifestUrl = `${hostUrl}/api/${userDoc.userId}/${userDoc.config?.configVersion}/manifest.json`;

        if (userDoc.apiKeys?.stremio) {
            updateStremioAddonCollection(userDoc.apiKeys.stremio, manifestUrl)
                .catch((syncError) => {
                    console.error('Errore aggiornamento addon Stremio:', syncError.message);
                });
        }

        res.json({
            success: true,
            userId: userDoc.userId,
            manifestUrl,
            configVersion: userDoc.config?.configVersion,
            apiKeys: userDoc.apiKeys, // Return keys for frontend state sync
            warnings,
            message: userDoc.apiKeys?.stremio ? "Configurazione salvata. Stremio aggiornato." : "Configurazione salvata."
        });

    } catch (err) {
        if (err.status) {
            return res.status(err.status).json({ error: err.message });
        }
        console.error("Errore salvataggio config:", err);
        res.status(500).json({ error: "Errore interno durante il salvataggio." });
    }
};
