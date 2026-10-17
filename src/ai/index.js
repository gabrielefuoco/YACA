const { createAiClient } = require('./client');
const { generateTmdbFiltersFromPrompt, routeLiveStremioSearch } = require('./router');

module.exports = {
    createAiClient,
    generateTmdbFiltersFromPrompt,
    routeLiveStremioSearch
};
