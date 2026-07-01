require('dotenv').config();
const mongoose = require('mongoose');

async function run() {
    const MONGODB_URI = process.env.MONGODB_URI;
    if (!MONGODB_URI) {
        console.error("MONGODB_URI mancante in .env");
        process.exit(1);
    }

    try {
        await mongoose.connect(MONGODB_URI);
        const CacheEntry = mongoose.connection.collection('cacheentries');
        
        console.log("Controllo i cataloghi vuoti o sotto la soglia dei 60 elementi...\n");
        
        // Find all preset catalog page 1 entries
        const cursor = CacheEntry.find({ key: { $regex: /^preset_.*_page_1$/ } });
        
        let warnings = 0;
        let total = 0;

        for await (const doc of cursor) {
            total++;
            const items = doc.value;
            if (!Array.isArray(items)) continue;
            
            if (items.length < 60) {
                console.log(`[WARNING] Catalogo quasi vuoto: ${doc.key} - Solo ${items.length} elementi!`);
                warnings++;
            }
        }
        
        console.log(`\nFinito. Ho analizzato ${total} cataloghi.`);
        if (warnings > 0) {
            console.log(`Trovati ${warnings} cataloghi critici.`);
        } else {
            console.log("Tutti i cataloghi superano la soglia dei 60 elementi.");
        }

    } catch(e) {
        console.error("Errore DB:", e.message);
    } finally {
        mongoose.disconnect();
        process.exit(0);
    }
}
run();
