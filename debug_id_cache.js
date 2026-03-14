const { translateImdbToTmdb } = require('./src/id_mapping/id_cache');

async function debug() {
    console.log('Testing tt1234567...');
    try {
        const result = await translateImdbToTmdb('tt1234567', 'fake-key');
        console.log('Result:', result);
        if (result !== null) {
            console.log('TYPE OF RESULT:', typeof result);
            console.log('VALUE:', JSON.stringify(result));
        }
    } catch (e) {
        console.log('CAUGHT OUTSIDE:', e.message);
    }
}

debug();
