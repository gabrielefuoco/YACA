const { Mistral } = require('@mistralai/mistralai');

/**
 * Genera un nome creativo per l'unione di due cataloghi usando Mistral.
 */
async function generateMergedName(req, res) {
    const { nameA, nameB } = req.body;
    const mistralKey = req.body.mistralKey || process.env.MISTRAL_API_KEY;

    if (!nameA || !nameB) {
        return res.status(400).json({ error: 'Nomi dei cataloghi mancanti' });
    }

    if (!mistralKey) {
        return res.json({ name: `${nameA} + ${nameB}` });
    }

    try {
        const client = new Mistral({ apiKey: mistralKey });
        const prompt = `Sei un esperto di cinema. Crea un nome creativo e accattivante (max 3 parole) che unisca i temi di: "${nameA}" e "${nameB}". Rispondi solo con il nome, senza introduzioni o virgolette.`;

        const response = await client.chat.complete({
            model: "mistral-small-latest",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.7
        });

        const suggestedName = response.choices?.[0]?.message?.content?.trim().replace(/^"|"$/g, '');
        res.json({ name: suggestedName || `${nameA} + ${nameB}` });
    } catch (err) {
        console.error("Errore AI Naming:", err.message);
        res.json({ name: `${nameA} + ${nameB}` });
    }
}

module.exports = {
    generateMergedName
};
