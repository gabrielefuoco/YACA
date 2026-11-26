Status: resolved
Type: task
Priorità: P1 (prima onda di rilascio)
Blocked by: nessuno

# 01 — Doppiaggi: sbloccare la freschezza degli indici AG

**Riferimento**: [`../risposta-senior.md`](../risposta-senior.md) — sezione **Q1** (diagnosi, codice completo di `indici.js`, test, metrica, rollback). Originale temporaneo: `C:\Users\gabri\AppData\Local\Temp\yaca-handoff-2026-11-15\risdp.md`.

## Contesto (il bug)

`services/doppiaggi-source/src/indici.js` riusa un file di cache se **esiste e pesa ≥ 500 byte**
(`findCachedFile`), senza alcun TTL. Né `services/doppiaggi-source/cli.js` né `ops/yaca-doppiaggi.sh`
passano `--force-refresh`. Risultato: **dopo il primo giro il servizio non fa più una sola richiesta di
rete**, l'indice AG resta congelato per sempre, i nuovi doppiaggi non entrano e il diff non produce
eventi poster. È l'anomalia A1 dell'handoff, la più grave del lotto.

Vincolo di cortesia: il budget attuale verso `antoniogenna.net` è 81 pagine × 2 giri = 158 richieste/giorno.

## Cosa fare

Riscrivere **solo la parte di fresh-check** di `services/doppiaggi-source/src/indici.js`, con un TTL unico sull'**mtime del file** e una rotazione a budget fisso. Niente sidecar, niente ETag.

1. **`pageTtlMs` = 12 h** (costante `DEFAULT_TTL_MS`). Una pagina è fresca se `now - stat.mtimeMs < TTL`.
2. **Rotazione**: a ogni giro si scaricano le pagine **assenti** + fino a `maxRefreshPerRun` pagine scadute scelte per mtime più vecchio. `maxRefreshPerRun = Math.ceil(pagine / 4)` → ogni pagina si rinfresca almeno ogni 4 giri (**48 h**), al costo di ~42 richieste/giorno.
3. **Scrittura atomica**: `writeFileSync(<file>.tmp.<pid>)` + `renameSync`. Due giri sovrapposti = vince l'ultimo, il file non si corrompe mai.
4. **Errore su pagina scaduta con copia presente**: si riusa la copia (il `catch` che già esiste), il giro continua.
5. `--force-refresh` continua a significare "ignora il TTL e scarica tutto" (lo usa solo l'operatore a mano).
6. Esportare `selectPagesForRefresh(allPages, cacheDir, fallbackDirs, minBytes, options)` per il test.

**Non** toccare `ops/yaca-doppiaggi.service|sh`: il comportamento fresco è il default.

> `ponytail:` TTL unico + mtime come unico stato. Il ceiling è che una pagina può restare stantia fino a 48 h e che il refresh costa 21 richieste anche quando nulla è cambiato. Upgrade path se serve: conditional GET (`If-Modified-Since`) con il `Last-Modified` di risposta salvato in un sidecar — solo allora vale un file di metadati.

## Adattamenti necessari rispetto al codice del revisore

- **Niente `fetch` globale**: il modulo fa richieste `https` e il wrapper forza `--dns-result-order=ipv4first`. Riusare il client già presente, parametrizzato (i test iniettano una funzione finta).
- `KNOWN_PAGES` non si riscrive: si tiene la lista reale del file e si calcola `maxRefreshPerRun` da `length`.
- Decode `windows-1252` invariato.
- **Non** servono il sidecar `indici-meta.json`, `etag`, `lastModified`, `sha256`: il TTL è l'mtime, il resto era ottimizzazione su un budget già ridotto di 4×.

## Test

In `services/doppiaggi-source/tests/indici.test.js`, quattro casi (un file, niente framework oltre `node:test` già usato):

1. **rotazione**: tre pagine, due scadute, `maxRefreshPerRun: 1` → viene scelta quella con mtime più vecchio;
2. **fresca non si scarica**: mtime di 1 h fa con TTL 12 h → zero richieste per quella pagina;
3. **errore su scaduta con copia** → riusa la copia, nessuna eccezione;
4. **errore su assente** → il giro prosegue sulle altre.

## Fatto quando

1. `node --test services/doppiaggi-source/tests/indici.test.js` verde.
2. Sul server, dopo il giro delle 04:00: tutti i file di `.cache/indici/` hanno `mtime` entro 48 h
   (`find .cache/indici -name '*.htm' -mmin +2880 | wc -l` = 0).
3. Nel journal: ~21 righe "scaricato" per giro invece di 81 "da cache".
4. Il file `ita_annotations.jsonl` cambia `mtime` a ogni giro in cui una pagina è cambiata (prima: mai).

## Rischi e rollback

- **Rischio**: un crawl degradato può ridurre i `true` → la guardia `writer.js` (−2%) blocca la
  sovrascrittura ed esce 2, che è il comportamento voluto. Non aggirare la guardia.
- **Rollback**: `maxRefreshPerRun: 0` oppure immagine precedente; `indici-meta.json` viene ignorato dal
  codice vecchio, nessuna migrazione.
