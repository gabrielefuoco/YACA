const axios = require('axios');
const fs = require('fs');

const ANIBRIDGE_URL = 'https://github.com/anibridge/anibridge-mappings/releases/download/v3/mappings.min.json';
const FRIBB_MINI_URL = 'https://raw.githubusercontent.com/Fribb/anime-lists/master/anime-list-mini.json';

async function testDualMapping() {
  console.log('⏳ Scaricamento dei JSON in corso...');
  const [anibridgeRes, fribbRes] = await Promise.all([
    axios.get(ANIBRIDGE_URL),
    axios.get(FRIBB_MINI_URL)
  ]);
  
  const anibridgeData = anibridgeRes.data;
  const fribbData = fribbRes.data;

  console.log('\n⚙️ Costruzione HashMap in memoria...');
  console.time('HashMap generate in');

  // A. Indici Fribb (anidb, anilist, mal -> kitsu)
  const fribbIndex = { anidb: new Map(), anilist: new Map(), mal: new Map() };
  for (const item of fribbData) {
    if (item.kitsu_id) {
      if (item.anidb_id) fribbIndex.anidb.set(String(item.anidb_id), item.kitsu_id);
      if (item.anilist_id) fribbIndex.anilist.set(String(item.anilist_id), item.kitsu_id);
      if (item.mal_id) fribbIndex.mal.set(String(item.mal_id), item.kitsu_id);
    }
  }

  // B. Indice Anibridge (TMDB -> Proxy Node + Rules)
  const tmdbToAnimeNode = new Map();

  const parseRange = (str) => {
    const [start, end] = str.split('-').map(Number);
    return { start, end: end || start };
  };

  for (const [clusterKey, mappings] of Object.entries(anibridgeData)) {
    if (clusterKey === '$meta') continue;

    // Trova un nodo anime "sicuro" in questo cluster da usare come ponte verso Fribb
    // Preferiamo anidb, poi anilist, poi mal.
    let bridgeNode = null;
    const allNodes = [clusterKey, ...Object.keys(mappings)];
    
    for (const node of allNodes) {
      if (node.startsWith('anidb:')) { bridgeNode = { p: 'anidb', id: node.split(':')[1] }; break; }
      if (node.startsWith('anilist:')) { bridgeNode = { p: 'anilist', id: node.split(':')[1] }; break; }
      if (node.startsWith('mal:')) { bridgeNode = { p: 'mal', id: node.split(':')[1] }; break; }
    }

    // Se non troviamo un nodo anime, ignoriamo (potrebbe essere puro western)
    if (!bridgeNode) continue;

    // Cerca i nodi TMDB nel cluster
    for (const [providerKey, episodesMap] of Object.entries(mappings)) {
      if (providerKey.startsWith('tmdb_show:') || providerKey.startsWith('tmdb_movie:')) {
        const parts = providerKey.split(':');
        const tmdbId = parts[1];
        let season = '1';
        if (parts.length > 2) {
            season = parts[2].replace('s', ''); // es. "s1" -> "1"
        }

        const key = `${tmdbId}:${season}`;

        const rules = [];
        for (const [targetRange, sourceRange] of Object.entries(episodesMap)) {
          const target = parseRange(targetRange); // es. TMDB "1-13"
          const source = parseRange(sourceRange); // es. AniDB "13-25"
          const offset = source.start - target.start;
          rules.push({ start: target.start, end: target.end, offset });
        }

        if (!tmdbToAnimeNode.has(key)) {
          tmdbToAnimeNode.set(key, []);
        }
        tmdbToAnimeNode.get(key).push({ bridgeNode, rules });
      }
    }
  }
  console.timeEnd('HashMap generate in');

  function resolveKitsu(tmdbId, tmdbSeason, tmdbEpisode) {
    const key = `${tmdbId}:${tmdbSeason}`;
    const nodeMappings = tmdbToAnimeNode.get(key);

    if (!nodeMappings) return { error: `TMDB ID ${key} non trovato in Anibridge` };

    for (const mapping of nodeMappings) {
      for (const rule of mapping.rules) {
        if (tmdbEpisode >= rule.start && tmdbEpisode <= rule.end) {
          const animeEpisode = tmdbEpisode + rule.offset;
          
          // Usa il ponte per trovare Kitsu in Fribb
          const mapToUse = fribbIndex[mapping.bridgeNode.p];
          const kitsuId = mapToUse.get(mapping.bridgeNode.id);
          
          if (!kitsuId) return { error: `Miss: ${mapping.bridgeNode.p} ${mapping.bridgeNode.id} non in Fribb` };

          return { 
            success: true, kitsuId, kitsuEpisode: animeEpisode, 
            debug: { bridge: `${mapping.bridgeNode.p}:${mapping.bridgeNode.id}`, offset: rule.offset } 
          };
        }
      }
    }
    return { error: `Episodio ${tmdbEpisode} non coperto dai mapping per TMDB ${key}` };
  }

  console.log('\n🧪 ESECUZIONE TEST CASES:');
  const testCases = [
    { name: "AoT S3 Parte 1 (TMDB S3 Ep 1)", id: 1429, s: 3, e: 1 },
    { name: "AoT S3 Parte 2 (TMDB S3 Ep 13) [SPLIT COUR OFFSET]", id: 1429, s: 3, e: 13 },
    { name: "Jujutsu Kaisen S2 (TMDB S2 Ep 1)", id: 95479, s: 2, e: 1 },
    { name: "Your Name (Film, TMDB ID 372058)", id: 372058, s: 1, e: 1 },
    { name: "Naruto Shippuden (TMDB S1 Ep 500) [SERIE LUNGA]", id: 31910, s: 1, e: 500 },
  ];

  for (const tc of testCases) {
    const start = process.hrtime.bigint();
    const result = resolveKitsu(tc.id, tc.s, tc.e);
    const end = process.hrtime.bigint();
    const ms = Number(end - start) / 1000000;

    console.log(`\n▶️ Test: ${tc.name}`);
    if (result.success) {
      console.log(`   ✅ Kitsu ID ${result.kitsuId}, Ep ${result.kitsuEpisode} | ${ms.toFixed(3)}ms (Offset: ${result.debug.offset}, Bridge: ${result.debug.bridge})`);
    } else {
      console.log(`   ❌ Errore: ${result.error}`);
    }
  }
}

testDualMapping().catch(console.error);
