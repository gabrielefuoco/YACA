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
    console.log("1. Preparazione batch per Mistral (Livello L3)...");
    
    // Raccogliamo i dati per gli L3
    const l3Entries = Object.entries(graph.L3);
    const BATCH_SIZE = 40;
    
    let totalUpdated = 0;
    
    for (let batchStart = 0; batchStart < l3Entries.length; batchStart += BATCH_SIZE) {
        const batchEntries = l3Entries.slice(batchStart, batchStart + BATCH_SIZE);
        const l3Data = {};
        
        for (const [v_id, v_data] of batchEntries) {
            l3Data[v_id] = {
                medoid: v_data.medoid,
                genres: v_data.inferred_genres,
                keywords: v_data.top_keywords.slice(0, 15) // Top 15 keywords
            };
        }

        const prompt = `
Sei un analista di metadati cinematografici.
Ho un dizionario JSON dove le chiavi sono gli ID dei cluster (L3) e i valori contengono le TOP 15 keyword e i generi predominanti.
Il tuo compito è generare un "Nome Categoria" DESCRITTIVO, FATTUALE E LETTERALE basato ESATTAMENTE sui temi presenti nelle keyword, accompagnato da un'emoji.
Il nome UI deve essere in ITALIANO. Non usare titoli "poetici" o di fantasia: descrivi il sotto-genere in modo diretto.

REGOLE TASSATIVE PER IL NOME:
1. Sii letterale e analitico: se le keyword dicono "zombie, virus, apocalisse", il nome deve essere "Apocalisse Zombie", non "La Fine dei Giorni".
2. **DIVIETO ASSOLUTO**: Non usare MAI le parole generiche dei macro-generi (es. "Dramma", "Drammatico", "Commedia", "Thriller", "Horror", "Azione"). Devi usare la pura descrittività tematica (es. NON "Thriller Poliziesco" ma "Indagini Oscure"; NON "Dramma Paesino" ma "Orrori Lovecraftiani"). Se vedi generi, ignorali per il nome, guarda le keyword!
3. Cerca di essere molto granulare e descrittivo (massimo 3-4 parole). Sii oggettivo.
4. Ispirati pesantemente alle "keywords" per capire il sotto-filone reale.

Regole per l'"emoji":
- Esattamente 1 carattere emoji pertinente.

RESTITUISCI ESCLUSIVAMENTE IL JSON FINALE. NESSUN TESTO DI CONTORNO, NESSUN MARKDOWN, SOLO IL JSON RAW VALIDO.
Il formato di output DEVE essere esattamente questo:
{
  "v_0": {
    "name": "Fantascienza Spaziale",
    "emoji": "🚀"
  },
  ...
}

Ecco i dati di input:
${JSON.stringify(l3Data, null, 2)}
`;

        console.log(`2. Chiamata API a Mistral per il batch ${batchStart / BATCH_SIZE + 1} di ${Math.ceil(l3Entries.length / BATCH_SIZE)}...`);
        try {
            const chatResponse = await client.chat.complete({
                model: "mistral-small-latest",
                messages: [{ role: 'user', content: prompt }]
            });
            
            let content = chatResponse.choices[0].message.content.trim();
            console.log("RAW MISTRAL RESPONSE (Truncated):", content.substring(0, 100) + "...");
            
            // Rimuovi eventuali blocchi markdown
            const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (jsonMatch) content = jsonMatch[1];
            else content = content.replace(/^```json/, "").replace(/```$/, "").trim();

            const nameRegex = /"name":\s*"([^"]+)"/g;
            const emojiRegex = /"emoji":\s*"?([^\s",}]+)"?/g;
            
            const names = [];
            const emojis = [];
            let match;
            while ((match = nameRegex.exec(content)) !== null) { names.push(match[1]); }
            while ((match = emojiRegex.exec(content)) !== null) { emojis.push(match[1]); }
            
            const keys = Object.keys(l3Data);
            for (let i = 0; i < keys.length; i++) {
                const v_id = keys[i];
                if (graph.L3[v_id] && names[i] && emojis[i]) {
                    graph.L3[v_id].ui_name = names[i];
                    graph.L3[v_id].ui_emoji = emojis[i];
                    console.log(`  - [${v_id}] ${graph.L3[v_id].medoid} -> ${emojis[i]} ${names[i]}`);
                    totalUpdated++;
                }
            }
        } catch (err) {
            console.error("Errore durante l'interazione con Mistral per il batch:", err);
        }
    }
    
    fs.writeFileSync(graphPath, JSON.stringify(graph));
    console.log(`[DONE] Aggiornate con successo ${totalUpdated} Vibes (L3)!`);
}

main();
