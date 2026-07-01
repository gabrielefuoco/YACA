require('dotenv').config();
const { getTmdbIdFromKitsuId } = require('./src/clients/kitsu');

const kitsuIds = [
    { label: 'Pokémon Horizons', id: '46859', season: 1 },
    { label: 'Re:ZERO 4th Season', id: '49746' },
    { label: 'That Time I Got Reincarnated as a Slime S4', id: '49235' },
    { label: 'Ascendance of a Bookworm S4', id: '48293' },
    { label: 'Daemons of the Shadow Realm', id: '50023' },
];

(async () => {
    for (const entry of kitsuIds) {
        try {
            const mapping = await getTmdbIdFromKitsuId(entry.id);
            console.log(`${entry.label} (kitsu:${entry.id})`);
            console.log(`  → tmdbId: ${mapping?.tmdbId} | season: ${mapping?.inferredSeason} | type: ${mapping?.type}`);
        } catch(e) {
            console.log(`${entry.label}: ERRORE - ${e.message}`);
        }
    }
    process.exit(0);
})();
