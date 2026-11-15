Status: ready-for-agent
Type: task
Priorità: P4 (quinta onda)
Blocked by: 00 (punto 1: baseline del volume)

# 09 — Poster: Garbage Collector del volume (con dry-run)

**Riferimento**: [`../risposta-senior.md`](../risposta-senior.md) — sezione **Q6**, parte GC (diagnosi punto 2, modulo `src/posters/gcPosterCache.js`, test, metrica, rollback). Originale temporaneo: `C:\Users\gabri\AppData\Local\Temp\yaca-handoff-2026-11-15\risdp.md`.

## Contesto

`/data/erdb-cache` **cresce e basta**: nessun TTL, nessuna quota, nessuna eviction. I badge episodici
(`_EP_1`, `_EP_2`, … `_ITA_12`) e i cambi di `BADGE_IMG_VERSION` accumulano migliaia di JPEG che nessuno
richiederà più. L'unica regola di "pulizia" esistente è l'unlink del singolo `.tmp` quando una scrittura
fallisce. Il volume è un bind Docker senza limite: prima o poi il disco del server finisce.

## Cosa fare

Nuovo `src/posters/gcPosterCache.js`, **due sole regole**:

1. **`.tmp` orfani** più vecchi di 15 minuti.
2. **TTL**: file con `mtime` più vecchio di **60 giorni**.

Più: barriera di sicurezza (mai toccare file con `mtime` < 60 minuti), `dryRun` default `true`,
`maxDelete` 500, report con `perMotivi` e `bytesLiberati`.

> `ponytail:` niente logica "episodio superato" e niente `utimes` sul serving. Il ceiling: un poster
> molto richiesto ma scritto 61 giorni fa viene cancellato e ricomposto alla prima richiesta (un render,
> self-healing su quella stessa richiesta). Upgrade path se diventa fastidioso: toccare l'mtime sul HIT
> (una riga, throttled a 24h) — così `mtime` diventa "ultimo uso" e il TTL si comporta da LRU.

**Dove gira**: nuovo timer systemd giornaliero alle **05:00** (`ops/yaca-poster-gc.{service,timer}`),
`ExecStart` con `docker exec` come il drenatore, argomenti espliciti `--max-delete 500 --ttl-days 60`.
Prima esecuzione a mano in dry-run.

## Adattamenti necessari

- I file il cui nome non si sa interpretare vanno **tenuti** (mai cancellare per ignoranza), e va scritto
  nel test.
- Escludere esplicitamente `versioni.json`, `report.json`, `sorgenti.json` (ticket 08).

## Test

`tests/gcPosterCache.test.js` (snippet di Q6 §3, ridotto ai due casi rimasti):

- `.tmp` di 30 min → rimosso; `.tmp` di 5 min → tenuto;
- file con `mtime` 90 giorni fa → rimosso; 10 giorni fa → tenuto;
- file scritto 10 min fa → **sempre** tenuto (barriera);
- file vecchio con nome non interpretabile → tenuto;
- `dryRun:true` → conta ma non cancella; `maxDelete:1` con 3 candidati → ne rimuove uno solo.

## Fatto quando

1. Test verdi.
2. Dry-run sul volume di produzione:
   `docker exec yaca-app node -e "require('./src/posters/gcPosterCache').gcPosterCache({cacheDir:'/data/erdb-cache',dryRun:true}).then(r=>console.log(JSON.stringify(r,null,2)))"`
   — leggere `bytesLiberati` e `perMotivo`, e **verificare a campione** 10 file tra i candidati.
3. Prima esecuzione reale: `bytesLiberati` > 0, nessun aumento dei 404 sulla rotta poster nelle 24 h
   successive (log `[StaticPosters] ANOMALIA` invariato).

## Rischi e rollback

- **Rischio**: cancellare un poster ancora in uso → la rotta fa 404 e mette l'evento in coda, il drenatore
  lo ricompone (costo: un render). Per questo `dryRun` di default, barriera 60 min, `maxDelete` basso.
- **Rollback**: non invocare il GC (timer spento). Nulla di irreversibile: i poster sono derivati e si
  rigenerano on-miss.
