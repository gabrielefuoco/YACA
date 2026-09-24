#!/usr/bin/env node
/**
 * scripts/qa/simulate.js
 *
 * Harness di simulazione profili YACA (ticket 10).
 * CLI con sottocomandi:
 *   profiles   crea/aggiorna i documenti di test in Atlas dalla spec
 *   fetch      scarica manifest + cataloghi dal server (read-only) nella run dir
 *   review     genera artefatti di revisione (JSON + MD) e summary strutturale
 *   compare    diff tra due run
 *   teardown   cancella i dati sim_* e verifica che il profilo reale sia intatto
 *
 * Protocollo di revisione: .scratch/simulazione-profili/rubric.md
 * Dettagli e flag: scripts/qa/README.md
 */

const { parseArgs, loadSpec, log, fail } = require('./lib/common');
const { materializeProfiles, teardownSimData, closeDb } = require('./lib/atlas');
const { runFetch } = require('./lib/fetch');

const DEFAULT_BASE_URL = (process.env.YACA_BASE_URL || 'https://mate.taild24589.ts.net').replace(/\/+$/, '');

const HELP = `
YACA — harness di simulazione profili (ticket 10)

Uso:
  node scripts/qa/simulate.js profiles  [--spec <file>] [--cold absent|empty] [--report <file>] [--json]
  node scripts/qa/simulate.js fetch     [--url <baseUrl>] [--run <dir>] [--profiles a,b] [--only id1,id2]
                                        [--pages N] [--fresh|--cached] [--include-search] [--concurrency N]
  node scripts/qa/simulate.js review    [--run <dir>] [--profiles a,b] [--spec <file>] [--limit N]
  node scripts/qa/simulate.js compare   <runA> <runB> [--out <file>]
  node scripts/qa/simulate.js teardown  [--dry-run] [--redis-url <url>]

Dettagli:
  profiles  Materializza UserAccount sim_user_yaca, AddonConfig sim-uuid-yaca con gli 8 profili,
            i TasteProfile clonati/freddi, la watchlist e la cronologia sintetiche.
            --cold empty materializza il secondo scenario freddo (documento con V_final:{}).
  fetch     Imposta activeProfileId sul profilo, scarica il manifest e ogni catalogo del manifest
            su 2 pagine (skip=0, skip=20). Default --fresh (_nocache=<ts>); --cached per la cache.
            Default base URL: ${DEFAULT_BASE_URL} (override con --url o YACA_BASE_URL).
            --only filtra i cataloghi per id completo o base id (senza prefisso yaca_preset_) e
            consente fetch dirette di preset/hero non presenti nel manifest (se conformi ai selettori).
  review    Genera un JSON + MD per profilo×catalogo e review/summary.{json,md}.
            I verdetti P/B/N NON vengono compilati: vedi rubric.md.
  compare   Confronta due run (review/ se presente, altrimenti raw/) e scrive
            compare_<runA>.md/.json nella run B.
  teardown  Cancella i documenti sim_* (regex su userId/addonUuid/owner) e le chiavi Redis
            del solo utente di test. Mai flushdb. Verifica finale sul profilo reale.

Esempi:
  node scripts/qa/simulate.js profiles
  node scripts/qa/simulate.js fetch --profiles sim_prof_cinefilo,sim_prof_otaku --only yaca_true_blend_movies,yaca_hidden_gems_series,preset_nolan,preset_hbo
  node scripts/qa/simulate.js review
  node scripts/qa/simulate.js teardown --dry-run
`;

function printProfilesReport(report, asJson) {
    if (asJson) {
        console.log(JSON.stringify(report, null, 2));
        return;
    }
    log(`Profili materializzati: ${report.profiles.length} (scenario freddo: ${report.coldScenario || 'n/d'})`);
    for (const p of report.profiles) {
        const dna = p.dna.mode === 'clone'
            ? `DNA ${p.dna.source} (${p.dna.keys} chiavi)`
            : `DNA ${p.dna.source} → ${p.dna.mode} (${p.dna.keys} chiavi)`;
        log(`  ${p.id.padEnd(22)} ${dna} · cataloghi ${p.catalogsTotal} (${p.presets} preset + ${p.heroes} hero) · history ${p.historyRows}`);
    }
    log(`Watchlist: ${report.watchlist.rows} righe (queryable movie ${report.watchlist.queryable.movie}, series ${report.watchlist.queryable.series}, anime ${report.watchlist.queryable.anime}; legacy itemId:null ${report.watchlist.legacyNullItemId})`);
    log(`Liste custom: ${report.lists.rows} · Cronologia: ${report.history.rows} righe`);
    log(`AddonConfig ${report.addonConfig.uuid}: activeProfileId=${report.addonConfig.activeProfileId}, configVersion=${report.addonConfig.configVersion}`);
    if (report.warnings.length) report.warnings.forEach(w => log(`  warning: ${w}`));
    log(`Report: ${report.reportPath}`);
}

async function main() {
    const { positional, flags } = parseArgs(process.argv.slice(2));
    const command = positional[0];
    if (!command || command === 'help' || flags.help) {
        console.log(HELP.trim());
        return 0;
    }

    switch (command) {
        case 'profiles': {
            const spec = loadSpec(flags.spec);
            const report = await materializeProfiles(spec, { cold: flags.cold, report: flags.report });
            printProfilesReport(report, Boolean(flags.json));
            return 0;
        }
        case 'fetch': {
            const run = await runFetch({
                spec: flags.spec,
                url: flags.url,
                run: flags.run,
                profiles: flags.profiles,
                only: flags.only,
                pages: flags.pages,
                fresh: flags.fresh,
                cached: flags.cached,
                'include-search': flags['include-search'],
                concurrency: flags.concurrency,
                pacing: flags.pacing,
                timeout: flags.timeout
            });
            if (flags.json) console.log(JSON.stringify(run, null, 2));
            return run.totals.manifestErrors > 0 || run.totals.items === 0 ? 1 : 0;
        }
        case 'review': {
            const { runReview } = require('./lib/review');
            const summary = runReview({ run: flags.run, profiles: flags.profiles, spec: flags.spec, limit: flags.limit });
            if (flags.json) console.log(JSON.stringify(summary, null, 2));
            return 0;
        }
        case 'compare': {
            const { runCompare } = require('./lib/compare');
            if (!positional[1] || !positional[2]) fail('Uso: compare <runA> <runB>');
            runCompare(positional[1], positional[2], { out: flags.out });
            return 0;
        }
        case 'teardown': {
            const report = await teardownSimData({
                dryRun: Boolean(flags['dry-run']),
                redisUrl: flags['redis-url']
            });
            if (flags.json) {
                console.log(JSON.stringify(report, null, 2));
            } else {
                log(`Teardown${report.dryRun ? ' (dry-run)' : ''}:`);
                for (const [name, stats] of Object.entries(report.collections)) {
                    log(`  ${name.padEnd(28)} matched=${stats.matched} deleted=${stats.deleted}`);
                }
                if (report.redis.error) {
                    log(`  redis: ${report.redis.error} (${report.redis.note || ''})`);
                } else {
                    log(`  redis (${report.redis.url}): matched=${report.redis.matched} deleted=${report.redis.deleted}${report.redis.dryRun ? ' (dry-run)' : ''}`);
                }
                log(`  Profilo reale ${report.realProfile.userId}: user=${report.realProfile.userFound} config=${report.realProfile.configFound} tasteprofiles=${report.realProfile.tasteProfiles}/${report.realProfile.expectedTasteProfiles} → ${report.realProfile.intact ? 'INTATTO' : 'ANOMALIA'}`);
                if (!report.dryRun) {
                    const leftovers = Object.entries(report.leftovers).filter(([, n]) => n > 0);
                    log(`  Residui sim_*: ${leftovers.length === 0 ? 'nessuno' : leftovers.map(([k, n]) => `${k}=${n}`).join(', ')}`);
                }
            }
            return report.realProfile.intact && (report.dryRun || Object.values(report.leftovers).every(n => n === 0)) ? 0 : 1;
        }
        default:
            fail(`Comando sconosciuto: "${command}". Esegui senza argomenti per l'help.`);
    }
}

main()
    .then(code => { process.exitCode = code; })
    .catch(err => {
        if (err.isCliError) {
            console.error(`[simulate] ERRORE: ${err.message}`);
        } else {
            console.error('[simulate] ERRORE inatteso:', err);
        }
        process.exitCode = 1;
    })
    .finally(async () => {
        try { await closeDb(); } catch { /* ignore */ }
    });
