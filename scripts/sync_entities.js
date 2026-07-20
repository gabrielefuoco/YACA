const fs = require('fs');
const path = require('path');
const duckDbStore = require('../src/db/duckDbStore');
const { getPresets } = require('../src/data/presets');

// Quante entità tenere (top per frequenza)
const LIMITS = {
    companies: 200,
    directors: 300,
    actors: 500,
    networks: 100
};

// Funzione helper per contare e ordinare
function processColumn(rows, columnName, limit) {
    const counts = {};
    const names = {};
    
    for (const row of rows) {
        if (!row[columnName] || row[columnName] === '[]') continue;
        try {
            const items = JSON.parse(row[columnName]);
            for (const item of items) {
                if (!item.id || !item.name) continue;
                counts[item.id] = (counts[item.id] || 0) + 1;
                // Sanitizza il nome per usarlo come chiave JS
                // es: "20th Century Fox" -> "20thCenturyFox"
                const cleanName = item.name.replace(/[^a-zA-Z0-9]/g, '');
                if (cleanName.length > 0) {
                    names[item.id] = cleanName;
                }
            }
        } catch (e) {
            // Ignora JSON non validi
        }
    }
    
    // Ordina per frequenza
    const sorted = Object.keys(counts)
        .sort((a, b) => counts[b] - counts[a])
        .slice(0, limit);
        
    // Costruisci oggetto finale
    const result = {};
    for (const id of sorted) {
        if (names[id]) {
            // Se c'è un conflitto di nome, tieni il primo (più frequente)
            if (!result[names[id]]) {
                result[names[id]] = parseInt(id, 10);
            } else {
                result[names[id] + '_' + id] = parseInt(id, 10); // Suffisso ID se conflitto
            }
        }
    }
    return result;
}

// Estrazione Keywords che sono *attualmente utilizzate* nei preset
// (non estraiamo tutte le 10k keywords per non appesantire)
function extractUsedKeywords() {
    const presets = getPresets();
    
    const extractFromTmdbSyntax = (val) => {
        if (!val) return [];
        return String(val).split(/[,|]/).map(Number).filter(Boolean);
    };

    const usedIds = new Set();
    
    for (const p of presets) {
        if (p.queries) {
            for (const q of p.queries) {
                extractFromTmdbSyntax(q.with_keywords).forEach(id => usedIds.add(id));
                extractFromTmdbSyntax(q.without_keywords).forEach(id => usedIds.add(id));
            }
        }
    }
    
    console.log(`[Sync Entities] Trovate ${usedIds.size} keyword distinte nei presets.`);
    return usedIds;
}

async function resolveKeywordsNames(usedIdsSet) {
    console.log(`[Sync Entities] Cerco i nomi delle keywords usate...`);
    const K = {};
    const missing = new Set(usedIdsSet);
    
    const resolveFromRows = (rows) => {
        for (const row of rows) {
            if (missing.size === 0) break;
            if (!row.keywords || row.keywords === '[]') continue;
            try {
                const items = JSON.parse(row.keywords);
                for (const item of items) {
                    if (missing.has(item.id)) {
                        let cleanName = item.name.replace(/[^a-zA-Z0-9]/g, '');
                        // CamelCase per parole separate da spazio se possibile, ma l'ID regex toglie spazi
                        // Meglio: split by space, capitalize, join
                        cleanName = item.name
                            .split(/[^a-zA-Z0-9]+/)
                            .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                            .join('');
                            
                        if (cleanName) {
                            K[cleanName] = item.id;
                            missing.delete(item.id);
                        }
                    }
                }
            } catch(e) {}
        }
    };
    
    const movieRows = await duckDbStore.query("SELECT keywords FROM movies WHERE keywords IS NOT NULL AND keywords != '[]'");
    resolveFromRows(movieRows);
    
    if (missing.size > 0) {
        const tvRows = await duckDbStore.query("SELECT keywords FROM tv WHERE keywords IS NOT NULL AND keywords != '[]'");
        resolveFromRows(tvRows);
    }
    
    if (missing.size > 0) {
        console.warn(`[Sync Entities] ATTENZIONE: ${missing.size} keywords usate nei presets non sono state trovate nel database locale! ID mancanti:`, Array.from(missing));
        // Aggiungiamo fallback numerici per non rompere il codice
        for (const id of missing) {
            K[`Unknown_${id}`] = id;
        }
    }
    
    return K;
}

async function run() {
    console.log('[Sync Entities] Avvio sincronizzazione...');
    await duckDbStore.init();
    
    console.log('[Sync Entities] 1/3 Querying movies...');
    const movieRows = await duckDbStore.query(`
        SELECT production_companies, directors, cast 
        FROM movies 
    `);
    
    console.log('[Sync Entities] 2/3 Querying TV...');
    const tvRows = await duckDbStore.query(`
        SELECT networks 
        FROM tv 
    `);
    
    console.log('[Sync Entities] 3/3 Elaborazione...');
    
    const entities = {
        companies: processColumn(movieRows, 'production_companies', LIMITS.companies),
        networks: processColumn(tvRows, 'networks', LIMITS.networks),
        people: {
            directors: processColumn(movieRows, 'directors', LIMITS.directors),
            actors: processColumn(movieRows, 'cast', LIMITS.actors)
        },
        keywords: {}
    };
    
    // Risolvi le Keyword
    const usedKeywords = extractUsedKeywords();
    entities.keywords = await resolveKeywordsNames(usedKeywords);
    
    entities._generatedAt = new Date().toISOString();
    
    const outPath = path.join(__dirname, '../src/data/entities.json');
    fs.writeFileSync(outPath, JSON.stringify(entities, null, 2));
    
    console.log(`[Sync Entities] FATTO! Generato ${outPath}`);
    console.log(`- Companies: ${Object.keys(entities.companies).length}`);
    console.log(`- Directors: ${Object.keys(entities.people.directors).length}`);
    console.log(`- Actors: ${Object.keys(entities.people.actors).length}`);
    console.log(`- Networks: ${Object.keys(entities.networks).length}`);
    console.log(`- Keywords: ${Object.keys(entities.keywords).length}`);
    
    process.exit(0);
}

run().catch(e => {
    console.error(e);
    process.exit(1);
});
