# yaca-doppiaggi-source

Scraper degli indici de **Il Mondo dei Doppiatori** (`antoniogenna.net/doppiaggio/`) e matcher contro il
catalogo YACA. Produce le annotazioni "questo titolo è doppiato in italiano".

È il gemello di `services/anime-source/`: modulo autonomo, CLI, test offline, zero dipendenze, nessun accesso
al database del core.

> **Stato**: scraper e matcher completi e verificati. Il **formato del file di annotazioni non è deciso** —
> `src/writer.js` è un gancio vuoto con `// TODO: formato deciso dal ticket 04` della mappa
> `.scratch/doppiaggio-ita/`. Non inventare lo schema qui.

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
4. **Writer** (`src/writer.js`) — gancio, formato in sospeso (ticket 04).

Da notare: i record del catalogo con titolo in **scrittura non latina** (cirillico, cinese, coreano, hindi)
hanno chiave di normalizzazione vuota e vengono scartati in lettura. È voluto: un titolo in cirillico non sarà
mai agganciato da un titolo italiano di AG, quindi restano `false`. Sono ~10.264 record su 116.964.

## Uso

```bash
node cli.js --dry-run                     # parsing + match, non scrive niente
node cli.js --dry-run --limit-catalog 500 # prova rapida
node cli.js --health-check                # battito (exit 0 se < 24h)
node cli.js --force-refresh               # ignora la cache e riscarica gli indici
```

| opzione | effetto |
|---|---|
| `--dry-run` | esegue tutto senza scrivere annotazioni |
| `--health-check` | verifica il battito di salute |
| `--force-refresh` | ignora la cache locale |
| `--cache-dir <dir>` | cartella cache delle pagine HTML (default `services/doppiaggi-source/.cache`) |
| `--movies-path <file>` / `--tv-path <file>` | dump del catalogo (`master_movies.jsonl`, `master_tv.jsonl`) |
| `--output <file>` | percorso del file di annotazioni (preview) |
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

```bash
node --test tests/   # 16 test, tutti verdi
```

I test coprono: le tre regole di parsing (incluse la lettera decorativa e l'articolo inglese), i quattro
percorsi di match, il rifiuto del rumore nel fuzzy stretto, il caso indecidibile che resta `null`, i record
non toccati che restano `false`, il gancio del writer e il filtro delle cartelle escluse.
