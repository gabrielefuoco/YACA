/** fetch-anilist.js — Scarica liste ANIME pubbliche da AniList (GraphQL, nessuna autenticazione).
 *
 *  Scoperta utenti:
 *    a) Page.activities con type fragments corretti (TextActivity, ListActivity, MessageActivity)
 *    b) Fallback: Page.media(type: ANIME, sort: POPULARITY_DESC) -> Page.mediaList(mediaId: $id) -> user { name }
 *    c) Fallback: Page.users(sort: ID_DESC) -> user { name }
 *
 *  Download liste:
 *    MediaListCollection(userName: $u, type: ANIME) { lists { entries { media { idMal } } } }
 *
 *  Output:
 *    .cache/anilist/users/<username>.json (array JSON di ID MyAnimeList: idMal)
 *
 *  Uso:
 *    N=50 MEDIA=30 node services/graph/fetch/fetch-anilist.js
 *    Default: N=3000, MEDIA=2000
 */

const fs = require('fs');
const path = require('path');

const CACHE = path.resolve(__dirname, '../../../.cache/anilist/users');
const DISCOVERY_CACHE = path.resolve(__dirname, '../../../.cache/anilist/_users.json');

const N = Number(process.env.N || 3000);
const MEDIA = Number(process.env.MEDIA || 2000);
const DELAY_MS = 700; // 600-800 ms politeness delay (AniList limit: 90 req/min ~ 667ms)

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function sanitizeFileName(name) {
    return name.replace(/[<>:"/\\|?*\0]/g, '_');
}

// Richiesta GraphQL di basso livello con gestione errori HTTP e rate limit
async function gql(query, variables) {
    try {
        const response = await fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({ query, variables }),
        });

        if (response.status === 429) {
            console.log('  [HTTP 429] Rate limit superato. Attesa 60s prima di riprovare...');
            return { retry: true };
        }

        if (response.status === 400) {
            const body = await response.text();
            console.error('  [HTTP 400] Errore GraphQL nello schema o nella richiesta:', body);
            return { err: 400, body };
        }

        if (response.status === 404) {
            return { err: 404 };
        }

        if (!response.ok) {
            const body = await response.text();
            console.warn(`  [HTTP ${response.status}] ${response.statusText}: ${body.slice(0, 200)}`);
            return { err: response.status, body };
        }

        const json = await response.json();
        return { data: json };
    } catch (e) {
        console.error('  [Rete] Errore di connessione:', e.message);
        return { err: 'network', message: e.message };
    }
}

// Wrapper con retry su 429 e transient network errors
async function requestGql(query, variables, maxRetries = 3) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const res = await gql(query, variables);
        if (res.retry) {
            await sleep(2000);
            continue;
        }
        if (res.err === 400 || res.err === 404) {
            return res;
        }
        if (!res || res.err) {
            if (attempt < maxRetries) {
                console.warn(`  [retry] Tentativo ${attempt + 1}/${maxRetries} fallito (${res.err}). Attesa 5s...`);
                await sleep(5000);
                continue;
            }
            return res;
        }
        return res;
    }
}

// Query 2a: Page.activities con i fragment corretti per tutti i tipi dell'ActivityUnion
const Q_ACTIVITIES = `
query($p: Int) {
  Page(page: $p, perPage: 50) {
    pageInfo {
      hasNextPage
    }
    activities(sort: ID_DESC) {
      __typename
      ... on TextActivity {
        user { name }
      }
      ... on ListActivity {
        type
        user { name }
      }
      ... on MessageActivity {
        messenger { name }
        recipient { name }
      }
    }
  }
}`;

// Query 2b (media): Page.media per scoprire gli anime più popolari
const Q_POPULAR_MEDIA = `
query($p: Int, $perPage: Int) {
  Page(page: $p, perPage: $perPage) {
    pageInfo {
      hasNextPage
    }
    media(type: ANIME, sort: POPULARITY_DESC) {
      id
    }
  }
}`;

// Query 2b (mediaList): utenti che hanno questo anime nella loro lista
const Q_MEDIA_LIST = `
query($mediaId: Int, $p: Int) {
  Page(page: $p, perPage: 50) {
    pageInfo {
      hasNextPage
    }
    mediaList(mediaId: $mediaId) {
      user {
        name
      }
    }
  }
}`;

// Query 2c: Page.users
const Q_USERS = `
query($p: Int) {
  Page(page: $p, perPage: 50) {
    pageInfo {
      hasNextPage
    }
    users(sort: ID_DESC) {
      name
    }
  }
}`;

// Query 3: MediaListCollection dell'utente per anime
const Q_USER_ANIME_LIST = `
query($u: String) {
  MediaListCollection(userName: $u, type: ANIME) {
    lists {
      entries {
        media {
          idMal
        }
      }
    }
  }
}`;

function countUncached(userSet) {
    let uncached = 0;
    for (const u of userSet) {
        const f = path.join(CACHE, sanitizeFileName(u) + '.json');
        if (!fs.existsSync(f)) uncached++;
    }
    return uncached;
}

(async () => {
    fs.mkdirSync(CACHE, { recursive: true });

    console.log(`[Config] Target N=${N} utenti, MEDIA=${MEDIA} media, Cache=${CACHE}`);

    // Carica utenti scoperti in precedenza
    const discoveredUsers = new Set();
    const legacyDiscoveryFile = path.join(CACHE, '_users.json');
    if (fs.existsSync(legacyDiscoveryFile)) {
        try {
            const arr = JSON.parse(fs.readFileSync(legacyDiscoveryFile, 'utf8'));
            arr.forEach(u => discoveredUsers.add(u));
        } catch {}
    }
    if (fs.existsSync(DISCOVERY_CACHE)) {
        try {
            const arr = JSON.parse(fs.readFileSync(DISCOVERY_CACHE, 'utf8'));
            arr.forEach(u => discoveredUsers.add(u));
        } catch {}
    }

    let uncachedCount = countUncached(discoveredUsers);
    console.log(`[Stato] Utenti noti in cache: ${discoveredUsers.size} (di cui ${uncachedCount} non ancora scaricati su disco).`);

    // 1) SCOPERTA UTENTI: METODO 2a (Page.activities)
    if (uncachedCount < N) {
        console.log(`[Scoperta 2a] Ricerca utenti attivi dalle recenti attività (Page.activities)...`);
        for (let p = 1; p <= 100 && uncachedCount < N * 1.5; p++) {
            const res = await requestGql(Q_ACTIVITIES, { p });
            await sleep(DELAY_MS);

            if (!res || res.err) {
                console.warn(`[Scoperta 2a] Errore su pagina ${p} (${res.err}). Interruzione metodo 2a.`);
                break;
            }

            const acts = res.data?.data?.Page?.activities || [];
            if (acts.length === 0) break;

            for (const a of acts) {
                if (a.user?.name) discoveredUsers.add(a.user.name);
                if (a.messenger?.name) discoveredUsers.add(a.messenger.name);
                if (a.recipient?.name) discoveredUsers.add(a.recipient.name);
            }

            fs.writeFileSync(DISCOVERY_CACHE, JSON.stringify([...discoveredUsers]));
            uncachedCount = countUncached(discoveredUsers);
            console.log(`  pag ${p} · ${discoveredUsers.size} utenti unici noti (${uncachedCount} da scaricare)`);

            const hasNext = res.data?.data?.Page?.pageInfo?.hasNextPage;
            if (!hasNext) break;
        }
    }

    // 2) SCOPERTA UTENTI: METODO 2b (Page.media -> Page.mediaList) - fallback/integrazione se servono altri utenti
    if (uncachedCount < N && MEDIA > 0) {
        console.log(`[Scoperta 2b] Integrazione tramite Page.media (fino a ${MEDIA} media)...`);
        let mediaFetched = 0;
        for (let mp = 1; mediaFetched < MEDIA && uncachedCount < N * 1.5; mp++) {
            const perPage = Math.min(50, MEDIA - mediaFetched);
            const mRes = await requestGql(Q_POPULAR_MEDIA, { p: mp, perPage });
            await sleep(DELAY_MS);
            if (mRes.err) break;

            const mediaItems = mRes.data?.data?.Page?.media || [];
            if (mediaItems.length === 0) break;

            for (const m of mediaItems) {
                mediaFetched++;
                const lRes = await requestGql(Q_MEDIA_LIST, { mediaId: m.id, p: 1 });
                await sleep(DELAY_MS);
                if (!lRes.err) {
                    const entries = lRes.data?.data?.Page?.mediaList || [];
                    for (const e of entries) {
                        if (e.user?.name) discoveredUsers.add(e.user.name);
                    }
                }
                if (countUncached(discoveredUsers) >= N * 1.5 || mediaFetched >= MEDIA) break;
            }

            fs.writeFileSync(DISCOVERY_CACHE, JSON.stringify([...discoveredUsers]));
            uncachedCount = countUncached(discoveredUsers);
            console.log(`  media ${mediaFetched}/${MEDIA} · ${discoveredUsers.size} utenti noti (${uncachedCount} da scaricare)`);

            const hasNext = mRes.data?.data?.Page?.pageInfo?.hasNextPage;
            if (!hasNext) break;
        }
    }

    // 3) SCOPERTA UTENTI: METODO 2c (Page.users) - fallback se necessario
    if (uncachedCount < N) {
        console.log(`[Scoperta 2c] Integrazione tramite Page.users...`);
        for (let up = 1; up <= 100 && uncachedCount < N * 1.5; up++) {
            const uRes = await requestGql(Q_USERS, { p: up });
            await sleep(DELAY_MS);
            if (uRes.err) break;

            const uList = uRes.data?.data?.Page?.users || [];
            if (uList.length === 0) break;

            for (const u of uList) {
                if (u.name) discoveredUsers.add(u.name);
            }

            fs.writeFileSync(DISCOVERY_CACHE, JSON.stringify([...discoveredUsers]));
            uncachedCount = countUncached(discoveredUsers);
            console.log(`  users pag ${up} · ${discoveredUsers.size} utenti noti (${uncachedCount} da scaricare)`);

            const hasNext = uRes.data?.data?.Page?.pageInfo?.hasNextPage;
            if (!hasNext) break;
        }
    }

    console.log(`[Download] Inizio download liste per target N=${N} nuovi utenti...`);

    let ok = 0;
    let totAnime = 0;
    let skipped = 0;

    for (const u of discoveredUsers) {
        if (ok >= N) break;

        const safeName = sanitizeFileName(u);
        const f = path.join(CACHE, safeName + '.json');

        // Skip se l'utente è già presente su disco (resume)
        if (fs.existsSync(f)) {
            skipped++;
            continue;
        }

        const res = await requestGql(Q_USER_ANIME_LIST, { u });
        await sleep(DELAY_MS);

        if (!res || res.err) {
            if (res && res.err === 404) {
                // Utente privato o non trovato: creiamo un file vuoto o saltiamo
                // Saltiamo per non considerare il profilo
            }
            continue;
        }

        const lists = res.data?.data?.MediaListCollection?.lists || [];
        const ids = [];
        for (const L of lists) {
            for (const e of (L.entries || [])) {
                if (e.media && typeof e.media.idMal === 'number') {
                    ids.push(e.media.idMal);
                }
            }
        }

        const uniqueIds = Array.from(new Set(ids));
        fs.writeFileSync(f, JSON.stringify(uniqueIds));
        ok++;
        totAnime += uniqueIds.length;

        // Stampa progresso ogni 25 utenti
        if (ok % 25 === 0) {
            console.log(`  [progresso] ${ok}/${N} utenti scaricati · ${totAnime} anime totali`);
        }
    }

    console.log(`FINE: ${ok} nuovi utenti scaricati · ${totAnime} anime totali (${skipped} già presenti saltati).`);
})().catch(e => {
    console.error('ERRORE FATALE:', e);
    process.exit(1);
});
