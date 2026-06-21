const UserConfig = require('../../models/UserConfig');
const { validateAuth, validateKeys } = require('./validators');
const { processProfiles, createGlobalProfileInput } = require('./profileProcessor');
const { updateStremioAddonCollection } = require('../../utils/stremioAddon');
const UserAccount = require('../../db/models/UserAccount');

module.exports = async (req, res) => {
    try {
        validateAuth(req);

        const { activeProfileId, profiles: bodyProfiles } = req.body;
        const userId = req.user.userId;

        // Read existing data from both tables via resolveUserConfig
        const existingUser = await UserConfig.resolveUserConfig(userId);

        const warnings = [];
        const {
            effectiveTmdbKey, // not used directly here but validated
            mistralKey,
            traktToken,
            traktRefreshToken,
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

            parsedProfiles = await processProfiles(inputProfiles, userId, mistralKey, warnings, effectiveTmdbKey);
        }

        const finalActiveProfileId = (activeProfileId && parsedProfiles?.some(p => p.id === activeProfileId))
            ? activeProfileId
            : (parsedProfiles?.some(p => p.id === 'global') ? 'global' : (parsedProfiles?.[0]?.id || existingUser?.activeProfileId || 'global'));



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
            stremioAuthKey: 'stremio'
        };

        // Only include keys that were explicitly provided in the request body
        // and have a non-empty validated value. Ignore empty/undefined values
        // to prevent accidental overwrite of existing DB tokens.
        const validatedValues = { effectiveTmdbKey, mistralKey, traktToken, traktRefreshToken, stremioAuthKey };
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

        // saveUser now handles both UserAccount + AddonConfig (Two-Table Split)
        const userDoc = await UserConfig.saveUser(updateData);

        // UserList cleanup removed because UserList model is deleted

        const hostUrl = req.context?.hostUrl || `${req.protocol}://${req.get('host')}`;
        const manifestUrl = `${hostUrl}/${userDoc.userId}/${userDoc.config?.configVersion}/manifest.json`;

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
