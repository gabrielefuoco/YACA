const fs = require('fs');
const path = require('path');
const http = require('http');
const zlib = require('zlib');
const readline = require('readline');

const GRAPH_PATH = path.join(__dirname, '../src/data/hierarchical_graph.json');

async function downloadAndExtractKeywords() {
    const datesToTry = [];
    for (let i = 0; i < 5; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const yyyy = d.getFullYear();
        datesToTry.push(`http://files.tmdb.org/p/exports/keyword_ids_${mm}_${dd}_${yyyy}.json.gz`);
    }

    let gzStream = null;
    for (const url of datesToTry) {
        console.log(`Trying to fetch ${url}...`);
        try {
            gzStream = await new Promise((resolve, reject) => {
                http.get(url, (res) => {
                    if (res.statusCode === 200) {
                        resolve(res);
                    } else {
                        res.resume(); // consume response data to free up memory
                        resolve(null);
                    }
                }).on('error', reject);
            });
            if (gzStream) break;
        } catch (e) {
            console.log(`Error fetching ${url}: ${e.message}`);
        }
    }

    if (!gzStream) {
        throw new Error("Could not download TMDB keyword export. Check internet or TMDB export availability.");
    }

    console.log("Found export! Parsing keywords...");
    const gunzip = zlib.createGunzip();
    const rl = readline.createInterface({
        input: gzStream.pipe(gunzip),
        crlfDelay: Infinity
    });

    // name (lowercase) -> id
    const tmdbKeywordMap = new Map();

    for await (const line of rl) {
        try {
            const data = JSON.parse(line);
            if (data.id && data.name) {
                // Some TMDB keywords are uppercase, map to lower for our graph matching
                tmdbKeywordMap.set(data.name.toLowerCase().trim(), data.id.toString());
            }
        } catch (e) {
            // ignore malformed lines
        }
    }
    
    console.log(`Successfully parsed ${tmdbKeywordMap.size} keywords from TMDB export.`);
    return tmdbKeywordMap;
}

async function patchGraph() {
    console.log("Loading hierarchical_graph.json...");
    const graphData = JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf8'));
    
    const stringKeys = Object.keys(graphData.kw_to_L1);
    console.log(`Graph currently maps ${stringKeys.length} string keywords to L1 clusters.`);

    const tmdbMap = await downloadAndExtractKeywords();

    const new_kw_to_L1 = {};
    let matchedCount = 0;
    let missingCount = 0;

    for (const kwStr of stringKeys) {
        const l1Cluster = graphData.kw_to_L1[kwStr];
        const kwId = tmdbMap.get(kwStr.toLowerCase());
        
        if (kwId) {
            new_kw_to_L1[kwId] = l1Cluster;
            matchedCount++;
        } else {
            missingCount++;
            // If TMDB doesn't have it exactly as string, we can't map it.
            // These might be very obscure or deprecated keywords.
        }
    }

    console.log(`Patching results:`);
    console.log(` - Matched exactly to TMDB ID: ${matchedCount}`);
    console.log(` - Missing/Unmatched: ${missingCount}`);

    // Override kw_to_L1
    graphData.kw_to_L1 = new_kw_to_L1;

    // Aggiorniamo anche i metadati per riflettere il fix
    graphData.metadata.version = "2.1-patched";
    graphData.metadata.patched_with_tmdb_ids = true;
    graphData.metadata.total_numeric_keywords = matchedCount;

    console.log(`Saving patched graph back to ${GRAPH_PATH}...`);
    fs.writeFileSync(GRAPH_PATH, JSON.stringify(graphData, null, 2), 'utf8');
    
    console.log("✅ PATCH COMPLETATA CON SUCCESSO!");
}

patchGraph().catch(console.error);
