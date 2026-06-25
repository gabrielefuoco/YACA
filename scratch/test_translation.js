require('dotenv').config();
const axios = require('axios');

async function test() {
    const res = await axios.get(`https://api.themoviedb.org/3/tv/274671/season/1/episode/1?api_key=${process.env.TMDB_API_KEY}&append_to_response=translations`);
    
    const itaTranslation = res.data.translations?.translations?.find(t => t.iso_639_1 === 'it');
    console.log("ITA Translation:");
    console.dir(itaTranslation, { depth: null });
    
    // Evaluate logic
    const hasItaName = itaTranslation && itaTranslation.data && itaTranslation.data.name && String(itaTranslation.data.name).trim() !== '' && String(itaTranslation.data.name).trim().toLowerCase() !== `episodio 1`;
    const hasItaOverview = itaTranslation && itaTranslation.data && itaTranslation.data.overview && String(itaTranslation.data.overview).trim() !== '';
    
    console.log("hasItaName:", hasItaName);
    console.log("hasItaOverview:", hasItaOverview);
}
test().catch(console.error);
