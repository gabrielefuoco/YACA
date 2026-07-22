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
            keywords: m_data.top_keywords.slice(0, 7) // Top 7 keywords per non appesantire il prompt
        };
    }

    const prompt = `
Sei un esperto di cinema e architettura dell'informazione.
Ho un dizionario JSON dove le chiavi sono gli ID delle categorie cinematografiche (L4) e i valori contengono le keyword e i generi di quella categoria.
Il tuo compito è analizzare i generi e le keyword di ogni categoria e generare un nome commerciale, molto accattivante e intuitivo da mostrare nell'interfaccia utente (UI), accompagnato da un'emoji rappresentativa.
Il nome UI deve essere in ITALIANO.
Regole per il "name":
- Massimo 3 parole (es. "Fantascienza e Spazio", "Dramma Sociale", "Avventura Epica").
- Usa la lettera maiuscola per ogni parola principale.
- Non essere troppo generico, ma nemmeno troppo specifico (ignora keyword isolate se non c'entrano col genere principale).

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

        const generatedData = JSON.parse(content);
        
        console.log("3. Iniezione dei nomi UI nel grafo...");
        let count = 0;
        for (const [m_id, res] of Object.entries(generatedData)) {
            if (graph.L4[m_id]) {
                graph.L4[m_id].ui_name = res.name;
                graph.L4[m_id].ui_emoji = res.emoji;
                console.log(`  - [${m_id}] ${graph.L4[m_id].medoid} -> ${res.emoji} ${res.name}`);
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
