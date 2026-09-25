const UserConfig = require('../../models/UserConfig');
const { validateAuth, validateKeys, sanitizeCustomCatalogs } = require('./validators');
const { processProfiles, createGlobalProfileInput } = require('./profileProcessor');
const { updateStremioAddonCollection } = require('../../utils/stremioAddon');

/**
 * Sceglie il profilo attivo da salvare.
 *
 * Se il profilo richiesto dal client non esiste più (id rigenerati, stato locale vecchio,
 * payload parziale) si conserva il profilo attivo già salvato, purché ancora valido: il
 * ritorno a `global` è l'ultima risorsa. Un fallback a `global` troppo aggressivo ha già
 * azzerato il profilo attivo di un utente reale, facendogli sparire i cataloghi da Stremio.
 *
 * @param {{ requested?: string, profiles?: Array<{id: string}>, previous?: string }} input
 * @returns {string}
 */
function resolveActiveProfileId({ requested, profiles, previous } = {}) {
    const ids = new Set((profiles || []).map(p => p?.id).filter(Boolean));
    if (requested && ids.has(requested)) return requested;
    if (previous && ids.has(previous)) return previous;
    const first = (profiles || [])[0]?.id;
    return first || 'global';
}

module.exports = async (req, res) => {
    try {
        validateAuth(req);

        const { activeProfileId, profiles: bodyProfiles, customCatalogs } = req.body;
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

        // Se il profilo attivo inviato dal client non esiste più, si conserva quello già salvato.
        // Quando il payload non porta i profili (attivazione rapida dal dashboard) la validazione
        // usa quelli già salvati: senza, l'id richiesto verrebbe scartato e l'attivazione persa.
        const profilesForValidation = parsedProfiles !== undefined ? parsedProfiles : (existingUser?.profiles || []);
        const previousActiveProfileId = existingUser?.config?.activeProfileId || existingUser?.activeProfileId;
        const finalActiveProfileId = resolveActiveProfileId({
            requested: activeProfileId,
            profiles: profilesForValidation,
            previous: previousActiveProfileId
        });



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
        if (customCatalogs !== undefined) updateData.customCatalogs = sanitizeCustomCatalogs(customCatalogs);
        if (stremioEmail) updateData.email = stremioEmail;

        // saveUser now handles both UserAccount + AddonConfig (Two-Table Split)
        const userDoc = await UserConfig.saveUser(updateData);

        // UserList cleanup removed because UserList model is deleted

        const hostUrl = req.context?.hostUrl || `${req.protocol}://${req.get('host')}`;
        const manifestUrl = `${hostUrl}/${userDoc.userId}/${userDoc.config?.configVersion}/manifest.json`;
        const manifestChanged = existingUser?.configVersion !== userDoc.config?.configVersion;

        // A new URL is required for Stremio to discard its cached manifest.
        // Avoid a pointless collection update when the save changed no manifest input.
        if (userDoc.apiKeys?.stremio && manifestChanged) {
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
            message: userDoc.apiKeys?.stremio && manifestChanged
                ? "Configurazione salvata. Stremio aggiornato."
                : "Configurazione salvata."
        });

    } catch (err) {
        if (err.status) {
            return res.status(err.status).json({ error: err.message });
        }
        console.error("Errore salvataggio config:", err);
        res.status(500).json({ error: "Errore interno durante il salvataggio." });
    }
};

// Esportata per i test di regressione sulla scelta del profilo attivo.
module.exports.resolveActiveProfileId = resolveActiveProfileId;
