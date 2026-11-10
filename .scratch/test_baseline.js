const { catalogHandler } = require('../src/stremio/catalogHandler');
const { getPresets } = require('../src/catalog/presets');
const mongoose = require('mongoose');

// Mock config with kidsMode
const userConfig = {
    userId: 'sim_user_yaca',
    addonUuid: 'sim-uuid-yaca',
    activeProfileId: 'sim_prof_famiglia',
    profiles: [
        {
            id: 'sim_prof_famiglia',
            name: 'Famiglia',
            settings: {
                kidsMode: true,
                typeSelectors: { film: false, serie: false, anime: null }
            }
        }
    ],
    apiKeys: {
        tmdb: 'fake_tmdb_key'
    }
};

console.log('Test baseline script ready');
