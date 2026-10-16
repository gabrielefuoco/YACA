Status: resolved
Type: research

# 04 — L'inventario: cosa non raggiunge nessuno

**Risolto il 17/10/2026.** Report in [`ricerche/01-inventario.md`](../ricerche/01-inventario.md) (434 righe,
sei tabelle con il comando che prova ogni riga). **Ha ribaltato la premessa del ticket** — vedi `## Esito`.

## Perché

Tre ticket della mappa (05, 06, e la parte «cancella» del 12) hanno bisogno della stessa cosa: **l'elenco di
ciò che nessuno raggiunge**, con le prove. Deciderlo leggendo i nomi dei file è il modo in cui si cancellano
cose vive e si tengono cose morte: la disciplina è quella di `diagnosing-bugs` — riprodurre e osservare, non
ipotizzare.

## La domanda

Partendo dagli ingressi reali del prodotto (`index.js`, gli script di `.github/workflows/`, il `Dockerfile`,
`docker-compose.yml`, `ops/`), cosa **non è raggiungibile**? E dei file tracciati in git, quali non dovrebbero
esserlo?

## Cosa deve uscire

Un report in `.scratch/confini/ricerche/01-inventario.md` con, in tabelle separate e ognuna con le prove:

1. **Moduli JS non raggiungibili** da `index.js` (import transitivi, `require` dinamici inclusi) **né** dai
   test in `tests/`. Per ognuno: chi lo nominava (se qualcuno) e perché non ci arriva più.
2. **`scripts/`** (48 file tracciati): quali sono citati da CI, `Dockerfile`, `ops/`, `docker-compose`,
   documentazione o altri script; quali sono one-off già eseguiti (migrazioni, backfill) e non più eseguibili
   senza danno.
3. **Dati e artefatti tracciati in git** che non dovrebbero esserlo: `src/data/bolle.json` (3,2 MB),
   `src/data/hierarchical_graph.json` (1 MB), `blank.pdf` (362 KB, alla root), `misura-*.md`, `todo grafo.md`,
   `Ottimizzazione e Futuro del Grafo YACA.md`. Per ognuno: chi lo legge (file:riga) e come si rigenera.
4. **Test orfani**: file in `tests/` che importano moduli non raggiungibili (cioè test di codice morto).
5. **Docs che descrivono codice scomparso**: `file:riga` citati in `docs/*.md` che non esistono più. La
   convenzione è in `docs/INDEX.md` («verifica a mano delle citazioni», 04/10/2026) — falla, e riporta i
   risultati.
6. **La root**: file non tracciati e spuri (`untitled.md`, `frontend.pdf`, `digest.txt`, `digest_7.txt`,
   `bash.exe.stackdump`, `.pytest_cache/`, `blank.pdf`), con chi li ha generati se si capisce.

## Come si verifica

Le prove sono **comandi eseguibili**, non asserzioni: per ogni voce, il comando che dimostra la conclusione
(`node -e "require('…')"`, `grep -rn` con i risultati contati, `git ls-files`, `docker exec …`). Un modulo
dichiarato morto senza il comando che lo dimostra non entra nel report.

**Questo ticket non cancella niente**: produce l'elenco. A cancellare sono 05, 06 e 12, ognuno con i suoi
test.

---

## Esito

**Il report è in [`ricerche/01-inventario.md`](../ricerche/01-inventario.md).** I numeri headline:

- **Moduli JS irraggiungibili sotto `src/`: ZERO** secondo il criterio del ticket (non raggiungibili né da
  `index.js` né dai test). Solo **tre** non sono raggiungibili dal prodotto — `mongoConnect.js`, `retry.js`
  (usati dagli script) e `tasteClusters.js` (shim di test).
- **`scripts/`: 19 file senza chiamante funzionale**, e **12 dei 19 non sono nominati in nessun altro posto
  della repo**. **Nessuno** è citato da CI, `Dockerfile` o `docker-compose`; l'automazione ne tocca 2 (via i
  timer di `ops/`) più 1 da una rotta admin.
- **Artefatti tracciati in git che non dovrebbero esserlo**: i 7 che il ticket nominava **più 6 trovati** — il
  più grosso non è `bolle.json` (3,27 MB) ma **`.scratch/mappa-pesata/bolle-nuovi.json` (34,3 MiB)**, scritto
  da uno script e letto da nessuno.
- **Test orfani: 5**, che importano i 3 moduli non raggiungibili dal prodotto (più 3 che importano script
  one-off).
- **Docs**: **una sola** citazione `file:riga` riferita a un file rimosso è ancora viva in due documenti
  (`src/utils/legacyTmdbAdapter.js` in `DUCKDB_ARCHITECTURE.md:64` e `CATALOG_LOGIC.md:119`, cancellato il
  23/07 mentre i docs venivano riallineati il 06/10).

### Le tre scoperte che cambiano i ticket a valle

1. **La premessa del ticket non regge per `src/`**: non c'è codice irraggiungibile. L'unico codice
   *comportamentalmente* morto è **`streamHandler`**: raggiungibile, ma un guscio di 31 righe che restituisce
   sempre `{streams: []}`.
2. **Il peso non è dove sembrava**: il più grosso artefatto tracciato è dentro `.scratch/` (34,3 MiB), e i
   file pesanti veri stanno nei dati, non nel codice.
3. **`scripts/erdb-builder/build.js` è importato da 4 file di prodotto**: uno script che è una dipendenza
   vera. «Cancellare `scripts/` tutta» avrebbe rotto il prodotto — ed è esattamente il motivo per cui
   l'inventario è venuto prima della cancellazione.

### I limiti dichiarati (non nascosti)

- chi ha generato `untitled.md` e `frontend.pdf` non si sa;
- «one-off già eseguito» è **provato** solo per `seed_learned_names.js`; per gli altri è dedotto da zero
  chiamanti più le date dei commit, non verificato sui dati di produzione;
- 3 siti di `require` dinamico non sono risolvibili meccanicamente (controllati a mano: è una lettura, non una
  prova);
- la deriva delle righe citate nei docs è **campionata** (3 citazioni su 481), non quantificata.

### Cosa cambia nei ticket a valle

- **05** non deve «cancellare il codice morto di `src/`» (non c'è): deve togliere i **13 artefatti tracciati**,
  i file spuri della root e gli **8 test orfani**.
- **06** decide su **19** file di `scripts/` (non su 48) e con un vincolo nuovo: `erdb-builder/build.js` è una
  dipendenza di prodotto e non si sposta come uno script.
