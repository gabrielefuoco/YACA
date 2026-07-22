require('dotenv').config();
const fs = require('fs');
const { Mistral } = require('@mistralai/mistralai');

const mistralKey = process.env.MISTRAL_API_KEY;
if (!mistralKey) {
    console.error("Missing MISTRAL_API_KEY in .env");
    process.exit(1);
}

const client = new Mistral({ apiKey: mistralKey, timeout: 60000 });
const graphPath = './src/data/hierarchical_graph.json';
const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));

async function main() {
    console.log("1. Preparazione batch per Mistral...");
    
    // Raccogliamo i dati per gli L4
    const l4Data = {};
    for (const [m_id, m_data] of Object.entries(graph.L4)) {
        l4Data[m_id] = {
            medoid: m_data.medoid,
            genres: m_data.inferred_genres,
            keywords: m_data.top_keywords.slice(0, 15) // Top 15 keywords per maggiore contesto
        };
    }

    const prompt = `
Sei un esperto copywriter e curatore editoriale di cinema.
Ho un dizionario JSON dove le chiavi sono gli ID delle categorie cinematografiche e i valori contengono le TOP 15 keyword (temi, oggetti, vibe) e i generi predominanti.
Il tuo compito è generare un "Nome Categoria" molto esplicativo e riassuntivo che faccia capire subito all'utente cosa troverà dentro, accompagnato da un'emoji.
Il nome UI deve essere in ITALIANO.

REGOLE TASSATIVE PER IL NOME:
1. DIVIETO ASSOLUTO: Non usare MAI le parole "Dramma", "Drammatico", "Commedia", "Thriller", "Horror" o "Azione".
2. Deve essere ESPLICATIVO e RIASSUNTIVO del filone tematico (es. "La Frontiera Selvaggia", "Magia e Mostri", "Indagini Oscure", "Eroi dello Sport", "Viaggi nello Spazio", "Vita in Cucina").
3. Massimo 3-4 parole. Usa la maiuscola per ogni parola principale.
4. Ispirati pesantemente alle "keywords" per capire la VIBE reale del cluster. I generi servono solo come contesto aggiuntivo.

Regole per l'"emoji":
- Esattamente 1 carattere emoji pertinente.

Regole per l'"emoji":
- Esattamente 1 carattere emoji.

RESTITUISCI ESCLUSIVAMENTE IL JSON FINALE. NESSUN TESTO DI CONTORNO, NESSUN MARKDOWN, SOLO IL JSON RAW VALIDO.
Il formato di output DEVE essere esattamente questo:
{
  "m_0": {
    "name": "Nome Categoria",
    "emoji": "🎬"
  },
  ...
}

Ecco i dati di input:
${JSON.stringify(l4Data, null, 2)}
`;

    console.log("2. Chiamata API a Mistral...");
    try {
        const chatResponse = await client.chat.complete({
            model: "mistral-small-latest",
            messages: [{ role: 'user', content: prompt }]
        });
        
        let content = chatResponse.choices[0].message.content.trim();
        console.log("RAW MISTRAL RESPONSE:");
        console.log(content);
        
        // Rimuovi eventuali blocchi markdown ```json
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
            content = jsonMatch[1];
        } else {
            content = content.replace(/^```json/, "").replace(/```$/, "").trim();
        }

        // Estrazione sicura via Regex per bypassare JSON non validi
        const nameRegex = /"name":\s*"([^"]+)"/g;
        const emojiRegex = /"emoji":\s*"?([^\s",}]+)"?/g;
        
        const names = [];
        const emojis = [];
        let match;
        while ((match = nameRegex.exec(content)) !== null) { names.push(match[1]); }
        while ((match = emojiRegex.exec(content)) !== null) { emojis.push(match[1]); }
        
        console.log("3. Iniezione dei nomi UI nel grafo...");
        let count = 0;
        const keys = Object.keys(l4Data);
        for (let i = 0; i < keys.length; i++) {
            const m_id = keys[i];
            if (graph.L4[m_id] && names[i] && emojis[i]) {
                graph.L4[m_id].ui_name = names[i];
                graph.L4[m_id].ui_emoji = emojis[i];
                console.log(`  - [${m_id}] ${graph.L4[m_id].medoid} -> ${emojis[i]} ${names[i]}`);
                count++;
            }
        }
        
        fs.writeFileSync(graphPath, JSON.stringify(graph));
        console.log(`[DONE] Aggiornate con successo ${count} Macro-Vibes!`);
        
    } catch (err) {
        console.error("Errore durante l'interazione con Mistral:", err);
    }
}

main();
