Status: resolved
Type: task
Priorità: P2
Blocked by: nessuno

# 13 — La policy dei titoli riconosceva solo il giapponese/cinese

**Riferimento**: ricognizione e numeri in [`../log/extra-punti-aperti.md`](../log/extra-punti-aperti.md) §4 e
[`../log/extra-2-animeunity.md`](../log/extra-2-animeunity.md) (backfill).

## Il bug

`resolveIngestTitle` in `services/tmdb-daemon/tmdbDumpClient.js` decideva "il titolo va bene così" con
`CJK_REGEX = /[\u3040-\u30ff\u4e00-\u9faf]/`, che copre **solo** kana e ideogrammi CJK. Un titolo coreano,
hindi, russo, thai o tamil non matchava, quindi `isCjk` era `false` e la policy concludeva "è già italiano",
tenendo `런닝맨` invece del titolo inglese **già presente nella stessa riga** (`name_en: "Running Man"`).

## Cosa è stato fatto

1. Predicato sostituito con `isNotLatin` (`!/[A-Za-z0-9]/`): la scala resta IT → EN → originale, ma "non
   latino" non è più solo "CJK".
2. `scripts/backfill-cjk-titles.js` esteso allo stesso predicato, e limitato ai titoli che hanno davvero
   `title_en`/`name_en` (altrimenti sono chiamate TMDB sprecate).

## Misure

| | prima | dopo backfill |
|---|---:|---:|
| film con titolo senza caratteri latini | 6.461 | **4.876** |
| serie con titolo senza caratteri latini | 1.794 | **980** |
| totale illeggibili | 8.255 | **5.856** |

2.290 titoli elaborati (766 serie + 1.524 film), 2.290 chiamate TMDB, ~13 minuti. Verifica dall'app:
`15226 → C.I.D.`, `5092 → Infinite Challenge`, `70672 → Men on a Mission`.

## Cosa resta fuori (dichiarato)

I **5.856** che restano non hanno **nessun** titolo inglese su TMDB: non c'è niente da recuperare con la
policy. Servirebbe una traslitterazione (CJK/cingalese/tamil → romaji), che richiede una fonte che oggi non
esiste: decisione di prodotto, non un fix.

## Note operative

- `--data-dir` del backfill accetta **solo** la forma `--data-dir=/path`; con lo spazio viene ignorato in
  silenzio e lo script usa `/app/.scratch/brainstorm/data`. Da correggere quando si tocca lo script.
- Lo script va eseguito in un container (ha bisogno di `duckdb`, che sull'host non c'è) e scrive **solo alla
  fine**: un troncamento a metà non lascia stato sporco, ma butta le chiamate fatte.
