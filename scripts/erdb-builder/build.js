#!/usr/bin/env node
const erdb = require('../../src/posters/erdb/build');

if (require.main === module) {
    erdb.main();
}

module.exports = erdb;