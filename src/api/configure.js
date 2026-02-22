const { v4: uuidv4 } = require('uuid');
const UserConfig = require('../models/UserConfig');
const { generateTmdbFiltersFromPrompt } = require('../ai/router');
const { presets: presetsList } = require('../data/presets');

module.exports = async (req, res) => {
    try {
        const { tmdbKey, mistralKey, traktUsername, activeProfileId, profiles, uuid: existingUuid } = req.body;

        if (!tmdbKey) {
            return res.status(400).json({ error: "La API Key di TMDB è obbligatoria." });
        }

        const uuid = existingUuid || uuidv4();
        const parsedProfiles = [];
        let catIndex = 1;
        let needsMistral = false;

        // Validation for Mistral
        if (profiles && Array.isArray(profiles)) {
            for (const p of profiles) {
                if (p.newPrompts && p.newPrompts.length > 0) needsMistral = true;
            }
        } else if (req.body.prompts && req.body.prompts.length > 0) {
            needsMistral = true;
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
                parsedCatalogs.push(...profile.existingCatalogs);
            }

            // 2. Aggiungi i Preset Hardcoded
            if (profile.selectedPresets && Array.isArray(profile.selectedPresets)) {
                for (const presetId of profile.selectedPresets) {
                    const presetObj = presetsList.find(p => p.id === presetId);
                    if (presetObj) {
                        parsedCatalogs.push({
                            id: `yaca_preset_${presetId}`,
                            name: presetObj.name,
                            type: presetObj.type,
                            filters: presetObj.filters
                        });
                    }
                }
            }

            // 3. Processa i nuovi prompt usando Mistral
            if (profile.newPrompts && Array.isArray(profile.newPrompts)) {
                for (const prompt of profile.newPrompts) {
                    if (!prompt || prompt.trim() === '') continue;
                    const filters = await generateTmdbFiltersFromPrompt(prompt, mistralKey);
                    parsedCatalogs.push({
                        id: `ai_custom_${uuid.substring(0, 5)}_${Date.now()}_${catIndex}`,
                        name: prompt.substring(0, 30),
                        raw_prompt: prompt,
                        type: 'movie',
                        filters: filters
                    });
                    catIndex++;
                }
            }

            parsedProfiles.push({
                id: profile.id || `prof_${Date.now()}_${Math.random().toString(36).substring(7)}`,
                name: profile.name || 'Nuovo Profilo',
                catalogs: parsedCatalogs,
                raw_ui_state: { // Salva lo stato UI grezzo per ripopolare i form facilmente
                    selectedPresets: profile.selectedPresets || [],
                    prompts: parsedCatalogs.filter(c => c.raw_prompt).map(c => c.raw_prompt)
                }
            });
        }

        const finalActiveProfileId = activeProfileId || (parsedProfiles.length > 0 ? parsedProfiles[0].id : null);

        // 4. Salva la configurazione
        await UserConfig.saveConfig({
            uuid,
            apiKeys: {
                tmdb: tmdbKey,
                mistral: mistralKey,
                trakt: traktUsername || null
            },
            catalogs: parsedProfiles[0]?.catalogs || [], // Mantiene il vecchio catalogs come fallback per chi ha client non aggiornati (o DB constraints)
            profiles: parsedProfiles,
            activeProfileId: finalActiveProfileId
        });

        res.json({ success: true, uuid });

    } catch (err) {
        console.error("Errore salvataggio config:", err);
        res.status(500).json({ error: "Errore interno durante il salvataggio. Riprova." });
    }
};
