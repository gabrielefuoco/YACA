require('dotenv').config();
const mongoose = require('mongoose');
const AddonConfig = require('../src/db/models/AddonConfig');
const UserAccount = require('../src/db/models/UserAccount');
const {
    resolveDnaNames,
    isPlaceholderName,
    getReadableFallback
} = require('../src/utils/tmdbNameResolver');
const { isRetiredTmdbKeywordId } = require('../src/data/keywordIds');

async function repairDnaNames() {
    const args = process.argv.slice(2);
    let isApply = false;
    let targetUuid = null;
    let targetUserId = null;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--apply') {
            isApply = true;
        } else if (args[i] === '--dry-run') {
            isApply = false;
        } else if (args[i] === '--uuid' && args[i + 1]) {
            targetUuid = args[++i];
        } else if (args[i] === '--user' && args[i + 1]) {
            targetUserId = args[++i];
        }
    }

    const isDryRun = !isApply;

    console.log(`=== REPAIR DNA NAMES SCRIPT ===`);
    console.log(`Modalità: ${isDryRun ? 'DRY-RUN (Sola lettura, nessuna scrittura)' : 'APPLY (Scrittura attiva su database)'}`);
    if (targetUuid) console.log(`Filtro UUID: ${targetUuid}`);
    if (targetUserId) console.log(`Filtro User ID: ${targetUserId}`);

    if (!process.env.MONGODB_URI) {
        console.error('ERRORE: MONGODB_URI non impostato nelle variabili d\'ambiente.');
        process.exit(1);
    }

    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connesso a MongoDB Atlas.\n');

        let query = {};
        if (targetUserId) {
            const user = await UserAccount.findOne({ userId: targetUserId }).lean();
            if (!user) {
                console.error(`Nessun UserAccount trovato con userId: ${targetUserId}`);
                await mongoose.disconnect();
                process.exit(1);
            }
            if (!user.addonUuid) {
                console.error(`L'utente ${targetUserId} non ha un addonUuid configurato.`);
                await mongoose.disconnect();
                process.exit(1);
            }
            query = { uuid: user.addonUuid };
        } else if (targetUuid) {
            query = { uuid: targetUuid };
        }

        const configs = await AddonConfig.find(query);
        console.log(`Trovati ${configs.length} documento/i AddonConfig da esaminare.\n`);

        let totalInspected = 0;
        let totalPlaceholders = 0;
        let totalResolved = 0;
        let totalDiscarded = 0;
        let totalFallbacks = 0;
        let totalUnchanged = 0;
        let configsWithChanges = 0;

        const tableRows = [];

        for (const configDoc of configs) {
            let docChanged = false;
            const profiles = configDoc.profiles || [];

            for (const profile of profiles) {
                const settings = profile.settings || {};
                const dnaFields = ['suggestedDNA', 'manualDNA'];

                for (const field of dnaFields) {
                    const dnaList = settings[field];
                    if (!Array.isArray(dnaList) || dnaList.length === 0) continue;

                    const newDnaList = [];
                    const itemsToResolve = [];

                    for (const item of dnaList) {
                        totalInspected++;
                        const id = String(item.id !== undefined && item.id !== null ? item.id : '').trim();
                        const type = String(item.type || '').trim().toLowerCase();
                        const currentName = String(item.name || '').trim();

                        // 1. Check if retired keyword
                        if (type === 'keyword' && isRetiredTmdbKeywordId(id)) {
                            totalDiscarded++;
                            totalPlaceholders++;
                            docChanged = true;
                            tableRows.push({
                                configUuid: configDoc.uuid,
                                profileName: profile.name,
                                field,
                                id,
                                type,
                                before: currentName || `(vuoto)`,
                                after: '[SCARTATO - KEYWORD RITIRATA]',
                                status: 'DISCARDED'
                            });
                            // Do not add to newDnaList (discard)
                            continue;
                        }

                        // 2. Check if placeholder
                        if (isPlaceholderName(currentName, type, id)) {
                            totalPlaceholders++;
                            itemsToResolve.push({ original: item, index: newDnaList.length });
                            // Placeholder inserted for now, will be updated after batch resolution
                            newDnaList.push({ ...item, id, type, name: currentName });
                        } else {
                            totalUnchanged++;
                            newDnaList.push(item);
                        }
                    }

                    // Batch resolve placeholder items for this field
                    if (itemsToResolve.length > 0) {
                        const itemsForResolver = itemsToResolve.map(x => x.original);
                        const resolvedResults = await resolveDnaNames(itemsForResolver, {
                            apiKey: process.env.TMDB_API_KEY,
                            budgetMs: 10000,
                            batchSize: 20,
                            batchDelayMs: 300,
                            filterRetired: true
                        });

                        // Map by type:id
                        const resolvedMap = new Map();
                        for (const r of resolvedResults) {
                            resolvedMap.set(`${r.type}:${r.id}`, r.name);
                        }

                        for (const { original, index } of itemsToResolve) {
                            const origId = String(original.id).trim();
                            const origType = String(original.type).trim().toLowerCase();
                            const resolvedName = resolvedMap.get(`${origType}:${origId}`) || getReadableFallback(origType, origId);
                            const beforeName = String(original.name || '').trim();

                            if (resolvedName !== beforeName) {
                                docChanged = true;
                                newDnaList[index].name = resolvedName;

                                const isFallback = resolvedName.startsWith(`${origType.charAt(0).toUpperCase() + origType.slice(1)} #`);
                                if (isFallback) {
                                    totalFallbacks++;
                                } else {
                                    totalResolved++;
                                }

                                tableRows.push({
                                    configUuid: configDoc.uuid,
                                    profileName: profile.name,
                                    field,
                                    id: origId,
                                    type: origType,
                                    before: beforeName || `(vuoto)`,
                                    after: resolvedName,
                                    status: isFallback ? 'FALLBACK' : 'RESOLVED'
                                });
                            } else {
                                totalUnchanged++;
                            }
                        }
                    }

                    settings[field] = newDnaList;
                }
            }

            if (docChanged) {
                configsWithChanges++;
                if (isApply) {
                    await AddonConfig.updateOne(
                        { _id: configDoc._id },
                        { $set: { profiles: configDoc.profiles } }
                    );
                    console.log(`[APPLY] Salvate modifiche per config ${configDoc.uuid}`);
                } else {
                    console.log(`[DRY-RUN] Modifiche rilevate per config ${configDoc.uuid} (nessuna scrittura effettuata)`);
                }
            }
        }

        // Print sample table of changes
        console.log('\n--- TABELLA MODIFICHE (id | type | PRIMA → DOPO) ---');
        if (tableRows.length === 0) {
            console.log('Nessuna voce placeholder o ritirata trovata. Il database è già pulito!');
        } else {
            const sample = tableRows.slice(0, 50); // Show up to 50 rows in stdout
            console.log(
                'ID'.padEnd(10) + ' | ' +
                'TYPE'.padEnd(10) + ' | ' +
                'PRIMA'.padEnd(25) + ' → ' +
                'DOPO'.padEnd(30) + ' | ' +
                'STATO'
            );
            console.log('-'.repeat(90));
            for (const row of sample) {
                console.log(
                    row.id.padEnd(10) + ' | ' +
                    row.type.padEnd(10) + ' | ' +
                    row.before.padEnd(25) + ' → ' +
                    row.after.padEnd(30) + ' | ' +
                    row.status
                );
            }
            if (tableRows.length > 50) {
                console.log(`... e altre ${tableRows.length - 50} voci.`);
            }
        }

        console.log('\n--- RIEPILOGO FINALE ---');
        console.log(`Config esaminati:         ${configs.length}`);
        console.log(`Config con modifiche:      ${configsWithChanges}`);
        console.log(`Voci DNA totali esaminate: ${totalInspected}`);
        console.log(`Voci placeholder trovate:  ${totalPlaceholders}`);
        console.log(`Voci risolte con nome:     ${totalResolved}`);
        console.log(`Voci scartate (ritirate):  ${totalDiscarded}`);
        console.log(`Voci fallback leggibile:   ${totalFallbacks}`);
        console.log(`Voci rimaste invariate:    ${totalUnchanged}`);
        console.log(`Modalità esecuzione:       ${isDryRun ? 'DRY-RUN (Nessuna modifica scritta su DB)' : 'APPLY (Modifiche persistite con successo)'}`);

        await mongoose.disconnect();
        console.log('\nConnessione MongoDB chiusa.');
        return {
            configsScanned: configs.length,
            configsWithChanges,
            totalInspected,
            totalPlaceholders,
            totalResolved,
            totalDiscarded,
            totalFallbacks,
            totalUnchanged,
            tableRows
        };
    } catch (err) {
        console.error('Errore durante l\'esecuzione dello script:', err);
        try { await mongoose.disconnect(); } catch (_) {}
        process.exit(1);
    }
}

if (require.main === module) {
    repairDnaNames();
}

module.exports = { repairDnaNames };
