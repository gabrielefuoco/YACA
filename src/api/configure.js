const { v4: uuidv4 } = require('uuid');
const UserConfig = require('../models/UserConfig');
const { generateTmdbFiltersFromPrompt } = require('../ai/router');
const { presets: presetsList } = require('../data/presets');

module.exports = async (req, res) => {
    try {
        const { tmdbKey, mistralKey, activeProfileId, profiles, uuid: existingUuid } = req.body;
        const traktToken = req.body.traktToken || req.body.traktUsername;

        if (!tmdbKey) {
            return res.status(400).json({ error: "La API Key di TMDB è obbligatoria." });
        }

        // Input validation - limiti ragionevoli
        if (typeof tmdbKey !== 'string' || tmdbKey.length > 200) {
            return res.status(400).json({ error: "TMDB Key non valida." });
        }
        if (mistralKey && (typeof mistralKey !== 'string' || mistralKey.length > 200)) {
            return res.status(400).json({ error: "Mistral Key non valida." });
        }
        if (traktToken && (typeof traktToken !== 'string' || traktToken.length > 500)) {
            return res.status(400).json({ error: "Token Trakt non valido." });
        }
        if (profiles && (!Array.isArray(profiles) || profiles.length > 20)) {
            return res.status(400).json({ error: "Massimo 20 profili consentiti." });
        }

        const uuid = existingUuid || uuidv4();
        const parsedProfiles = [];
        let catIndex = 1;
        let needsMistral = false;

        // Validation for Mistral
        if (profiles && Array.isArray(profiles)) {
            for (const p of profiles) {
                if (p.newPrompts && p.newPrompts.some(pr => pr && pr.trim().length > 0)) needsMistral = true;
            }
        } else if (req.body.prompts && Array.isArray(req.body.prompts)) {
            if (req.body.prompts.some(pr => pr && pr.trim().length > 0)) needsMistral = true;
        }

        if (needsMistral && !mistralKey) {
            return res.status(400).json({ error: "Per i cataloghi IA dinamici serve la chiave API Mistral." });
        }

        // --- BACKWARD COMPATIBILITY / DEFAULT PROFILE MAPPING ---
        let inputProfiles = profiles || [];
        if (!profiles || profiles.length === 0) {
            // Retrocompatibilità con i vecchi payload 
            inputProfiles = [{
                id: 'default',
                name: 'Generale',
                selectedPresets: req.body.selectedPresets || [],
                existingCatalogs: [],
                newPrompts: req.body.prompts || []
            }];
        }

        // --- PROCESSING PROFILES ---
        for (const profile of inputProfiles) {
            const parsedCatalogs = [];

            // 1. Aggiungi Cataloghi AI Esistenti (se stiamo modificando)
            if (profile.existingCatalogs && Array.isArray(profile.existingCatalogs)) {
                parsedCatalogs.push(...profile.existingCatalogs.slice(0, 50));
            }

            // 2. Aggiungi i Preset Hardcoded (deduplicati)
            if (profile.selectedPresets && Array.isArray(profile.selectedPresets)) {
                const seenPresets = new Set();
                for (const presetId of profile.selectedPresets.slice(0, 50)) {
                    if (typeof presetId !== 'string') continue;
                    if (seenPresets.has(presetId)) continue;
                    seenPresets.add(presetId);
                    const presetObj = presetsList.find(p => p.id === presetId);
                    if (presetObj) {
                        parsedCatalogs.push({
                            id: `yaca_preset_${presetId}`,
                            name: presetObj.name,
                            type: presetObj.type,
                            filters: { ...presetObj.filters }
                        });
                    }
                }
            }

            // 3. Processa i nuovi prompt usando Mistral (in parallelo)
            if (profile.newPrompts && Array.isArray(profile.newPrompts)) {
                const validPrompts = profile.newPrompts
                    .filter(p => typeof p === 'string' && p.trim() !== '')
                    .map(p => p.trim().substring(0, 500))
                    .slice(0, 20);
                const filterResults = await Promise.all(
                    validPrompts.map(prompt => generateTmdbFiltersFromPrompt(prompt, mistralKey))
                );

                for (let i = 0; i < validPrompts.length; i++) {
                    const prompt = validPrompts[i];
                    const filters = filterResults[i];
                    // Detect type from prompt and AI response
                    let catalogType = 'movie';
                    const lowerPrompt = prompt.toLowerCase();
                    if (filters.target === 'kitsu') {
                        catalogType = 'series';
                    } else {
                        const seriesPatterns = ['serie tv', 'serie ', 'series', 'tv show', 'show tv', 'sitcom', 'anime', 'k-drama', 'kdrama', 'docuserie', 'miniserie', 'telefilm'];
                        if (seriesPatterns.some(kw => lowerPrompt.includes(kw))) {
                            catalogType = 'series';
                        }
                    }
                    parsedCatalogs.push({
                        id: `ai_custom_${uuid.substring(0, 5)}_${Date.now()}_${catIndex}`,
                        name: prompt.substring(0, 30),
                        raw_prompt: prompt,
                        type: catalogType,
                        filters: filters
                    });
                    catIndex++;
                }
            }

            const profileName = (typeof profile.name === 'string' ? profile.name.trim() : '') || 'Nuovo Profilo';

            parsedProfiles.push({
                id: profile.id || `prof_${Date.now()}_${Math.random().toString(36).substring(7)}`,
                name: profileName.substring(0, 50),
                catalogs: parsedCatalogs,
                settings: profile.settings || { minVoteAverage: 0, minVoteCount: 0 },
                raw_ui_state: { // Salva lo stato UI grezzo per ripopolare i form facilmente
                    selectedPresets: profile.selectedPresets || [],
                    prompts: parsedCatalogs.filter(c => c.raw_prompt).map(c => c.raw_prompt)
                }
            });
        }

        // Verifica che activeProfileId punti a un profilo esistente
        const profileIds = new Set(parsedProfiles.map(p => p.id));
        const finalActiveProfileId = (activeProfileId && profileIds.has(activeProfileId))
            ? activeProfileId
            : (parsedProfiles.length > 0 ? parsedProfiles[0].id : null);

        // 4. Salva la configurazione
        await UserConfig.saveConfig({
            uuid,
            apiKeys: {
                tmdb: tmdbKey,
                mistral: mistralKey,
                trakt: traktToken || null
            },
            catalogs: parsedProfiles[0]?.catalogs || [], // Mantiene il vecchio catalogs come fallback per chi ha client non aggiornati (o DB constraints)
            profiles: parsedProfiles,
            activeProfileId: finalActiveProfileId
        });

        // Recupera configVersion per il link di aggiornamento Stremio
        let configVersion = null;
        try {
            const savedConfig = await UserConfig.findOne({ uuid });
            if (savedConfig) configVersion = savedConfig.configVersion;
        } catch (_) { /* ignore */ }

        res.json({ success: true, uuid, configVersion });

    } catch (err) {
        console.error("Errore salvataggio config:", err);
        res.status(500).json({ error: "Errore interno durante il salvataggio. Riprova." });
    }
};
