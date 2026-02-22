const { v4: uuidv4 } = require('uuid');
const UserConfig = require('../models/UserConfig');
const { generateTmdbFiltersFromPrompt } = require('../ai/router');

module.exports = async (req, res) => {
    try {
        const { tmdbKey, mistralKey, prompts, traktUsername } = req.body;

        if (!tmdbKey || !mistralKey) {
            return res.status(400).json({ error: "Le API Key di TMDB e Mistral sono obbligatorie." });
        }

        // Genera un UUID univoco per questo utente/setup
        const uuid = uuidv4();

        // 1. Processa ogni prompt inviato dal frontend usando Mistral
        const parsedCatalogs = [];
        if (prompts && Array.isArray(prompts)) {
            let catIndex = 1;
            for (const prompt of prompts) {
                // Aspettiamo che Mistral elabori i filtri per questo prompt
                const filters = await generateTmdbFiltersFromPrompt(prompt, mistralKey);

                parsedCatalogs.push({
                    id: `ai_custom_${catIndex}`,
                    name: prompt.substring(0, 30), // Usa parte del prompt come nome
                    filters: filters
                });
                catIndex++;
            }
        }

        // 2. Salva la configurazione nel Database (Supabase)
        await UserConfig.saveConfig({
            uuid,
            apiKeys: {
                tmdb: tmdbKey,
                mistral: mistralKey,
                trakt: traktUsername || null
            },
            catalogs: parsedCatalogs
        });

        // 3. Ritorna l'UUID al frontend per comporre il manifest link
        res.json({ success: true, uuid });

    } catch (err) {
        console.error("Errore salvataggio config:", err);
        res.status(500).json({ error: "Errore interno durante il salvataggio. Riprova." });
    }
};
