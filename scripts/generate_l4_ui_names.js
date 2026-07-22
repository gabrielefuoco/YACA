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
    console.log("1. Preparazione batch per Mistral (Livello L4 Macro-Clusters)...");
    
    // Raccogliamo i dati per gli L4
    const l4Entries = Object.entries(graph.L4);
    const BATCH_SIZE = 40;
    
    let totalUpdated = 0;
    
    for (let batchStart = 0; batchStart < l4Entries.length; batchStart += BATCH_SIZE) {
        const batchEntries = l4Entries.slice(batchStart, batchStart + BATCH_SIZE);
        const l4Data = {};
        
        for (const [m_id, m_data] of batchEntries) {
            l4Data[m_id] = {
                medoid: m_data.medoid,
                genres: m_data.inferred_genres,
                keywords: m_data.top_keywords.slice(0, 15) // Top 15 keywords
            };
        }

        const prompt = `
Sei un analista di metadati cinematografici.
Ho un dizionario JSON dove le chiavi sono gli ID dei Macro-Cluster (L4) e i valori contengono le TOP 15 keyword e i generi predominanti.
I cluster L4 sono i contenitori "Macro" generali che racchiudono molteplici sotto-generi.
Il tuo compito è generare un "Nome Macro-Categoria" DESCRITTIVO e AMPIO basato sui temi presenti nelle keyword, accompagnato da un'emoji.
Il nome UI deve essere in ITALIANO.

REGOLE TASSATIVE PER IL NOME:
1. Sii letterale e raggruppante: il nome deve sembrare una vera categoria di un catalogo (es. "Misteri e Investigazioni", "Natura ed Esplorazione", "Guerra e Conflitti Storici", "Cultura Pop e Musica").
2. **DIVIETO ASSOLUTO**: Non usare MAI le parole generiche dei macro-generi (es. "Dramma", "Drammatico", "Commedia", "Thriller", "Horror", "Azione"). Concentrati sul TEMA MACRO.
3. Cerca di essere ampio ma descrittivo (massimo 3-4 parole). Sii oggettivo.
4. Ispirati pesantemente alle "keywords" per capire il filone reale.

Regole per l'"emoji":
- Esattamente 1 carattere emoji pertinente al macro-tema.

RESTITUISCI ESCLUSIVAMENTE IL JSON FINALE. NESSUN TESTO DI CONTORNO, NESSUN MARKDOWN, SOLO IL JSON RAW VALIDO.
Il formato di output DEVE essere esattamente questo:
{
  "m_1": {
    "name": "Spionaggio e Intrighi",
    "emoji": "🕵️"
  },
  ...
}

Ecco i dati di input:
${JSON.stringify(l4Data, null, 2)}
`;

        console.log(`2. Chiamata API a Mistral per il batch ${batchStart / BATCH_SIZE + 1} di ${Math.ceil(l4Entries.length / BATCH_SIZE)}...`);
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
            
            const keys = Object.keys(l4Data);
            for (let i = 0; i < keys.length; i++) {
                const m_id = keys[i];
                if (graph.L4[m_id] && names[i] && emojis[i]) {
                    graph.L4[m_id].ui_name = names[i];
                    graph.L4[m_id].ui_emoji = emojis[i];
                    console.log(`  - [${m_id}] ${graph.L4[m_id].medoid} -> ${emojis[i]} ${names[i]}`);
                    totalUpdated++;
                }
            }
        } catch (err) {
            console.error("Errore durante l'interazione con Mistral per il batch:", err);
        }
    }
    
    fs.writeFileSync(graphPath, JSON.stringify(graph, null, 2));
    console.log(`[DONE] Aggiornati con successo ${totalUpdated} Macro-Cluster (L4)!`);
}

main();
