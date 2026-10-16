#!/usr/bin/env node
const erdb = require('../../src/erdb/build');

if (require.main === module) {
    erdb.main();
}

module.exports = erdb;