#!/usr/bin/env node
/**
 * scripts/qa/preflight-deploy.js
 *
 * Controlla, PRIMA di un deploy, le cose che rompono la produzione **in silenzio** — cioè senza
 * far cadere un container e senza accendere un allarme. Nasce da tre difetti trovati il 19/10/2026
 * proprio mentre si preparava il deploy del ticket 30:
 *
 *  1. il compose montava un volume e puntava a un file che **nessuno produceva**
 *     (`anime-mappings.json`), e l'app avrebbe degradato i cataloghi anime senza dire niente;
 *  2. **due** meccanismi facevano lo stesso lavoro (il container `tmdb-daemon` **e** un timer systemd
 *     che lanciava lo stesso cli dentro `yaca-app`), entrambi sullo stesso volume: due scrittori;
 *  3. Watchtower aggiorna le **immagini**, non il **compose**: senza un `up -d --no-build` il mount
 *     nuovo non entra mai nel container.
 *
 * Uso:  node scripts/qa/preflight-deploy.js
 * Esce **1** se una verifica fallisce (è un guardiano, non un report).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const esiti = [];

function verifica(nome, fn) {
    try {
        const esito = fn();
        esiti.push({ nome, ok: true, nota: esito || 'ok' });
    } catch (err) {
        esiti.push({ nome, ok: false, nota: err.message });
    }
}

const leggi = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// ---------------------------------------------------------------- 1. l'artefatto anime
verifica('compose: l\'app monta il volume dell\'artefatto anime in sola lettura', () => {
    const compose = leggi('docker-compose.yml');
    if (!/yaca_anime_source_cache:\/data\/anime-source:ro/.test(compose)) {
        throw new Error('manca il mount `yaca_anime_source_cache:/data/anime-source:ro` nel servizio app');
    }
    return 'mount presente';
});

verifica('compose: ANIME_MAPPING_PATH punta a un file che il produttore scrive davvero', () => {
    const compose = leggi('docker-compose.yml');
    const m = compose.match(/ANIME_MAPPING_PATH=([^\s]+)/);
    if (!m) throw new Error('ANIME_MAPPING_PATH non è impostato nel servizio app');
    const percorso = m[1];
    const nome = path.basename(percorso);

    // Il produttore: la cartella è la cache condivisa, il nome è quello dell'indice.
    const produttore = leggi('services/anime-source/src/mappingIndex.js');
    const nomeProd = (produttore.match(/DEFAULT_FILENAME\s*=\s*'([^']+)'/) || [])[1];
    if (!nomeProd) throw new Error('non trovo DEFAULT_FILENAME in mappingIndex.js');
    if (nome !== nomeProd) {
        throw new Error(`il compose cerca "${nome}" ma il produttore scrive "${nomeProd}"`);
    }

    // E il produttore deve scrivere NELLA CARTELLA CONDIVISA, non in una effimera.
    const identity = leggi('services/anime-source/src/identity.js');
    if (!/publishMappingIndex\(/.test(identity)) {
        throw new Error('il produttore non chiama publishMappingIndex: l\'artefatto non verrebbe mai scritto');
    }
    if (!/publishIndex/.test(identity)) {
        throw new Error('il produttore non ha lo switch publishIndex: la pubblicazione non è garantita');
    }
    return `${nome} — produttore e consumatore d'accordo`;
});

verifica('il consumatore legge lo stesso percorso che il compose gli passa', () => {
    const mapping = leggi('src/anime/mapping.js');
    if (!/process\.env\.ANIME_MAPPING_PATH/.test(mapping)) {
        throw new Error('src/anime/mapping.js non legge ANIME_MAPPING_PATH: il compose lo imposterebbe a vuoto');
    }
    return 'ANIME_MAPPING_PATH letto dal modulo anime';
});

verifica('il produttore pubblica nella cache condivisa (non in una cartella effimera)', () => {
    const compose = leggi('docker-compose.yml');
    // Il produttore ha in cacheDir /app/.cache, che è il volume; il consumatore lo legge da /data/anime-source.
    const volProd = /yaca_anime_source_cache:\/app\/\.cache/.test(compose);
    const volApp = /yaca_anime_source_cache:\/data\/anime-source/.test(compose);
    if (!volProd || !volApp) {
        throw new Error('i due servizi non condividono il volume dell\'artefatto anime');
    }
    return 'stesso volume per produttore e consumatore';
});

// ---------------------------------------------------------------- 2. un solo scrittore del dump
verifica('il dump TMDB ha UN SOLO meccanismo (container o unità, non entrambi)', () => {
    const compose = leggi('docker-compose.yml');
    const haServizio = /^ {2}tmdb-daemon:/m.test(compose);
    const unita = ['ops/yaca-tmdb-daemon.service', 'ops/yaca-tmdb-daemon.timer']
        .filter(f => fs.existsSync(path.join(ROOT, f)));
    if (haServizio && unita.length > 0) {
        throw new Error(`due scrittori sullo stesso volume: il servizio compose E ${unita.join(', ')}`);
    }
    if (!haServizio && unita.length === 0) {
        throw new Error('nessun meccanismo: il dump TMDB non si aggiornerebbe');
    }
    return haServizio ? 'il container `tmdb-daemon` (scelta del README)' : 'le unità systemd';
});

verifica('il servizio del dump condivide il volume con l\'app', () => {
    const compose = leggi('docker-compose.yml');
    const blocco = compose.split(/^ {2}tmdb-daemon:/m)[1] || '';
    if (!/yaca_tmdb:\/data\/tmdb/.test(blocco)) {
        throw new Error('il daemon non monta `yaca_tmdb`: l\'app non vedrebbe i parquet');
    }
    return 'volume yaca_tmdb condiviso';
});

// ---------------------------------------------------------------- 3. le unità che il mate deve avere
verifica('le unità in ops/ che il mate deve installare sono dichiarate', () => {
    const richieste = ['ops/yaca-poster-eventi.service', 'ops/yaca-poster-eventi.timer'];
    const mancanti = richieste.filter(f => !fs.existsSync(path.join(ROOT, f)));
    if (mancanti.length) throw new Error(`mancano: ${mancanti.join(', ')}`);
    const svc = leggi('ops/yaca-poster-eventi.service');
    if (!/ExecStart=.*drenaCodaPoster\.js/.test(svc)) {
        throw new Error('l\'unità dei poster non chiama drenaCodaPoster.js');
    }
    return 'unità dei poster coerente';
});

// ---------------------------------------------------------------- 4. la regola del compose
verifica('esiste la regola scritta: Watchtower non applica il compose', () => {
    const doc = leggi('docs/DEPLOYMENT_HOME_SERVER.md');
    if (!/up -d --no-build/.test(doc) || !/watchtower/i.test(doc)) {
        throw new Error('docs/DEPLOYMENT_HOME_SERVER.md non dice che serve `up -d --no-build` dopo un cambio di compose');
    }
    return 'regola documentata';
});

// ---------------------------------------------------------------- report
console.log('\nPreflight del deploy — le rotture silenziose\n' + '='.repeat(52));
for (const e of esiti) {
    console.log(`${e.ok ? '  ok  ' : ' FALL '} ${e.nome}\n         ${e.nota}`);
}
const falliti = esiti.filter(e => !e.ok).length;
console.log('='.repeat(52));
console.log(falliti === 0 ? 'Tutto in ordine: si può deployare.' : `${falliti} verifiche fallite: NON deployare così.`);
process.exit(falliti === 0 ? 0 : 1);
