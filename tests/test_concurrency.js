const { acquireLock, releaseLock } = require('../src/utils/distributedLock');
const mongoose = require('mongoose');
require('dotenv').config();

async function testConcurrency() {
    console.log('--- Testing Distributed Lock Concurrency ---');
    const lockKey = 'test_lock_concurrency';
    
    // Attempt to acquire the same lock multiple times simultaneously
    const results = await Promise.all([
        acquireLock(lockKey, 5000),
        acquireLock(lockKey, 5000),
        acquireLock(lockKey, 5000)
    ]);

    const acquiredCount = results.filter(r => r === true).length;
    console.log(`Lock acquisition results: ${results}`);
    if (acquiredCount === 1) {
        console.log('✅ PASS: Only one process acquired the lock.');
    } else {
        console.error(`❌ FAIL: ${acquiredCount} processes acquired the lock!`);
    }

    await releaseLock(lockKey);
    console.log('Lock released.');

    // Test re-acquisition after release
    const reacquired = await acquireLock(lockKey, 5000);
    if (reacquired) {
        console.log('✅ PASS: Lock re-acquired after release.');
    } else {
        console.error('❌ FAIL: Could not re-acquire lock after release.');
    }
    await releaseLock(lockKey);
}

testConcurrency().then(() => {
    console.log('Test completed.');
    process.exit(0);
}).catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
