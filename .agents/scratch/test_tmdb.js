require('dotenv').config();
const axios = require('axios');
axios.get('https://api.themoviedb.org/3/search/movie?query=Chiedimi+se+sono+felice&language=it-IT', {
    headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` }
}).then(res => console.log(res.data.results[0].poster_path));
