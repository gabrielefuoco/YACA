const axios = require('axios');
require('dotenv').config();

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const tmdbIds = [
    65942,  // Re:Zero
    30983,  // Detective Conan
    290019, // I Made Friends with the Second Prettiest Girl in My Class
    245842, // Wistoria
    220150, // Pokemon Orizzonti
    37854,  // One Piece
    209174  // Witch Hat Atelier
];

async function checkShow(id) {
    try {
        const res = await axios.get(`https://api.themoviedb.org/3/tv/${id}`, {
            params: {
                api_key: TMDB_API_KEY,
                language: 'it-IT'
            }
        });
        const show = res.data;
        console.log(`\nShow: ${show.name} (ID: ${id})`);
        console.log(`  Status: ${show.status}`);
        console.log(`  First air date: ${show.first_air_date}`);
        if (show.next_episode_to_air) {
            console.log(`  Next episode to air: Ep ${show.next_episode_to_air.episode_number} on ${show.next_episode_to_air.air_date}`);
        } else {
            console.log(`  Next episode to air: None`);
        }
        if (show.last_episode_to_air) {
            console.log(`  Last episode to air: Ep ${show.last_episode_to_air.episode_number} on ${show.last_episode_to_air.air_date}`);
        }
    } catch (e) {
        console.error(`Error fetching show ${id}:`, e.message);
    }
}

async function run() {
    for (const id of tmdbIds) {
        await checkShow(id);
    }
}

run();
