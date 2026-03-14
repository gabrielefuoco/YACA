const UserConfig = require('../../models/UserConfig');
const UserList = require('../../db/models/UserList');
const { resolveHostUrl } = require('../../utils/helpers');
const { validateAuth, validateKeys } = require('./validators');
const { processProfiles, createGlobalProfileInput } = require('./profileProcessor');
const { updateStremioAddonCollection } = require('../../utils/stremioAddonSync');

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

        const configVersion = Date.now().toString(36);

        const updateData = {
            userId,
            config: {
                activeProfileId: finalActiveProfileId,
                configVersion
            }
        };

        // Prepare API Keys for update
        const apiKeys = {};
        let hasApiKeys = false;
        const keyMap = { 
            tmdbKey: 'tmdb', 
            mistralKey: 'mistral', 
            traktToken: 'trakt', 
            traktRefreshToken: 'traktRefreshToken', 
            mdblistKey: 'mdblist', 
            stremioAuthKey: 'stremio' 
        };

        for (const [bodyKey, dbKey] of Object.entries(keyMap)) {
            if (Object.prototype.hasOwnProperty.call(req.body, bodyKey)) {
                apiKeys[dbKey] = req.body[bodyKey] === '' ? null : (req.body[bodyKey] || null);
                hasApiKeys = true;
            }
        }

        if (hasApiKeys) updateData.apiKeys = apiKeys;
        if (parsedProfiles !== undefined) updateData.profiles = parsedProfiles;
        if (stremioEmail) updateData.email = stremioEmail;

        const userDoc = await UserConfig.saveUser(updateData);

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
        const manifestUrl = `${hostUrl}/${userDoc.userId}/${configVersion}/manifest.json`;

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
            configVersion,
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
