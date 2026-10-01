# yaca-doppiaggi-source

Scraper degli indici de **Il Mondo dei Doppiatori** (`antoniogenna.net/doppiaggio/`) e matcher contro il
catalogo YACA. Produce le annotazioni "questo titolo è doppiato in italiano".

È il gemello di `services/anime-source/`: modulo autonomo, CLI, test offline, zero dipendenze, nessun accesso
al database del core.

> **Stato**: completo. Scraper, parser, matcher e writer. Il file prodotto è un **NDJSON**; il **parquet
> tipato** lo materializza il **core** (che ha già DuckDB) leggendolo: così il modulo resta **senza
> dipendenze native**. Formato deciso dal ticket 04 della mappa `.scratch/doppiaggio-ita`.

## Cosa fa

1. **Indici** (`src/indici.js`) — scarica le **79 pagine d'indice**: le 4 zone utili (`film.htm`,
   `telefilm.htm`, `anim.htm`, `soap.htm`) e le loro pagine-lettera (`film-1.htm`…`film-24.htm` e simili).
   `altro.htm` **è escluso**: contiene videogiochi, premi, interviste, speciali — non titoli.
   - cortesia: `User-Agent` identificabile con contatto, delay 800 ms, una sola connessione, cache su disco e
     ripresa dal punto se si interrompe;
   - lettura in **windows-1252** (non UTF-8).
2. **Parsing** (`src/parse.js`) — da ogni pagina estrae titolo, anno e zona. Tre regole **non negoziabili**,
   tutte misurate sul sito (sono le trappole che fanno sembrare la fonte inutilizzabile):
   - **(a) i tag si rimuovono SENZA inserire spazi**: l'HTML è
     `<a href=soap/acapulcobay.htm><b>A</b>capulco Bay</a>` e deve uscire `Acapulco Bay`. Sostituire i tag con
     uno spazio produce `A capulco Bay`;
   - **(b) articolo invertito**: `Titolo (Il)` → `Il Titolo` — e vale **anche per l'articolo inglese**:
     `Old Guard 2 (The)` → `The Old Guard 2` (~1.209 titoli, ~18% delle voci senza candidato);
   - **(c) `(1983)` fra parentesi finale = anno di disambiguazione**, da conservare a parte e usare **esatto**.
3. **Match** (`src/match.js`) — la scala decisa e misurata (mappa `doppiaggio-ita`, ticket *La scala di
   match*):
   - `true` se il titolo ha **un solo candidato**;
   - `true` se l'**anno esatto** ne lascia **uno** (mai ±1: su 961 omonimi la tolleranza aggiunge 5 casi e
     ammette il remake sbagliato);
   - `true` se la **zona→tipo** (`film` → film, `telefilm`/`anim`/`soap` → serie) ne lascia **uno**;
   - **fuzzy stretto** per le voci senza candidato: contenimento di token fra i due titoli (A⊆B o B⊆A) e, se il
     token in comune è **uno solo**, deve essere raro (df ≤ 3) — altrimenti è rumore (`6 Teen` → *Teen Wolf*);
   - altrimenti **`null`**: il matcher **non sceglie mai** fra più candidati;
   - i record del catalogo che nessuna voce AG tocca restano **`false`**.
4. **Writer** (`src/writer.js`) — scrive il file delle annotazioni e il suo meta.

## Il file prodotto

Accanto al dump (dove sta il parquet) nascono due file:

```
ita_annotations.jsonl        una riga per voce, solo true e null
ita_annotations.meta.json    conteggi, timestamp, schemaVersion
```

```json
{"t":"movie","id":5,"ita":true}
{"t":"tv","id":1399,"ita":null}
```

- la chiave è **`(tipo, id)`**: **5.933 id TMDB vivono in *entrambe* le tabelle** (il `5920` è sia *Le 24 ore
  di Le Mans* sia *The Mentalist*), quindi il tipo fa parte della chiave;
- nel file finiscono **solo `true` e `null`**: l'**assenza di riga vale `false`**. I ~10.264 record con titolo
  in scrittura non latina non entrano nel file e restano fuori per costruzione;
- la scrittura è **atomica** (`.tmp` + `rename`): o il file vecchio, o quello nuovo, mai un file a metà;
- **guardia**: se i `true` calano oltre il **2%** rispetto al meta precedente, il file **non viene
  sovrascritto** e il CLI esce con codice 2. È una regola del *file* (l'ultimo valido resta valido) — il
  **merge** nel catalogo ha invece scelto di non bloccare mai il dump: due posti diversi, due decisioni.
- in dry-run non scrive niente e riporta quante righe scriverebbe.

Da notare: i record del catalogo con titolo in **scrittura non latina** (cirillico, cinese, coreano, hindi)
hanno chiave di normalizzazione vuota e vengono scartati in lettura. È voluto: un titolo in cirillico non sarà
mai agganciato da un titolo italiano di AG, quindi restano `false`. Sono ~10.264 record su 116.964.

## Uso

```bash
node cli.js --dry-run                     # parsing + match, non scrive niente
node cli.js --dry-run --limit-catalog 500 # prova rapida
node cli.js --health-check                # battito (exit 0 se < 24h)
node cli.js --force-refresh               # ignora la cache e riscarica gli indici
node cli.js                               # giro completo: scrive le annotazioni accanto al dump
```

| opzione | effetto |
|---|---|
| `--dry-run` | esegue tutto senza scrivere annotazioni |
| `--health-check` | verifica il battito di salute |
| `--force-refresh` | ignora la cache locale |
| `--cache-dir <dir>` | cartella cache delle pagine HTML (default `services/doppiaggi-source/.cache`) |
| `--movies-path <file>` / `--tv-path <file>` | dump del catalogo (`master_movies.jsonl`, `master_tv.jsonl`) |
| `--output <file>` | percorso del `.jsonl` (default: accanto al dump, `ita_annotations.jsonl`) |
| `--limit-catalog <n>` | tetto di record da caricare, per debug |

La cache già esistente in `.scratch/doppiaggio-ita/tmp/` viene usata come ripiego: in sviluppo **non serve
rifare richieste di rete**.

## Verifica (01/10/2026)

Dry run sul catalogo reale, 4,49 s:

| | |
|---|---|
| pagine d'indice | 81 · **25.165 voci AG** |
| catalogo | 106.700 record |
| **`true`** | 19.531 voci (77,6%) · **19.126 record** |
| `null` | 1.929 omonimi irrisolti · 4.543 record |
| non trovate nel DB | 3.705 voci |
| `false` | 83.031 record |

Il file prodotto in quel giro: **23.669 righe** (`true` 19.126 · `null` 4.543), ~700 KB.

```bash
node --test tests/   # 23 test, tutti verdi
```

I test coprono: le tre regole di parsing (incluse la lettera decorativa e l'articolo inglese), i quattro
percorsi di match, il rifiuto del rumore nel fuzzy stretto, il caso indecidibile che resta `null`, i record
non toccati che restano `false`, la **chiave `(tipo, id)`**, il formato e l'atomicità del writer, la
**guardia** sul calo dei `true`, il dry-run e il filtro delle cartelle escluse.
