const { getDuckDbMetaDetails } = require('./src/catalog/providers/DuckDbProvider');
async function test() {
    const meta = await getDuckDbMetaDetails(550, 'movie'); // Fight Club
    console.dir(meta.rawTMDB.keywords, {depth: null});
    process.exit(0);
}
test();
