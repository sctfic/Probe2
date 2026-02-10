const UnitsSyncService = require('./services/UnitsSyncService');

async function test() {
    console.log("Starting sync test...");
    await UnitsSyncService.syncAllExtenders();
    console.log("Sync test complete.");
    process.exit(0);
}

test();
