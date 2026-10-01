# yaca-doppiaggi-source

Scraper degli indici de **Il Mondo dei Doppiatori** (`antoniogenna.net/doppiaggio/`), lettura in sola lettura
della collezione **`anime_airing_state`** (AnimeUnity) e matcher contro il catalogo YACA. Produce le annotazioni
definitive "questo titolo è doppiato in italiano".

È il gemello di `services/anime-source/`: modulo autonomo con CLI e test offline. Ha come unica dipendenza
il driver **`mongodb`** (per leggere lo stato degli anime in sola lettura, esattamente come `anime-source`) e
resta **senza dipendenze native**.

> **Stato**: completo. Scraper, parser, matcher, unione anime AG ∪ AnimeUnity e writer. Il file prodotto è un
> **NDJSON**; il **parquet tipato** lo materializza il **core** (che ha già DuckDB) leggendolo: così il modulo
> resta senza dipendenze native. Formato deciso dal ticket 04 della mappa `.scratch/doppiaggio-ita`.

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
4. **Unione Anime** (`src/anime.js`, `src/annotations.js`) — fonde le voci de Il Mondo dei Doppiatori con lo
   stato doppiaggi anime di AnimeUnity (`anime_airing_state`).
5. **Writer** (`src/writer.js`) — scrive il file delle annotazioni e il suo meta con guardia atomica.

## Unione Anime (AG ∪ AnimeUnity)

Fuori dal catalogo simulcast, il badge anime in YACA sarà la parola **`ITA` secca** letta direttamente dalla
colonna `ita`. Se l'unione non avvenisse nella build del file di annotazioni, un anime doppiato presente **solo**
su AnimeUnity (e non censito su Antonio Genna) perderebbe il badge.

- **Regola del doppiaggio**: identica a quella del core in `src/data/animeAiringState.js:593-611` (`getDubEpisode`)
  e `173-174` (estrazione da `raw.dub` o `italian.dub.latest`, con fallback sull'episodio più recente con
  `dubIta: true` in `episodes[]`).
- **Verifica del presupposto serie vs film (misurazione reale)**:
  La collezione contiene **902 anime doppiati**.
  - **562 id** esistono nel dump TV (`master_tv.jsonl`) → `t: "tv"`;
  - **268 id** NON esistono nel dump TV ma esistono nel dump film (`master_movies.jsonl`) → sono **film anime**
    (es. *Kimi no Na wa*, *Tenki no Ko*, *Suzume no Tojimari*, *THE FIRST SLAM DUNK*, *Promare*, *Redline*). Il
    modulo assegna correttamente `t: "movie"`, consentendo a DuckDB di agganciare la colonna `ita` nel parquet dei film;
  - **72 id** non sono presenti in nessuno dei due dump TMDB → default `t: "tv"`;
  - **214 id** vivono in entrambi i dump (sovrapposizione degli spazi ID numerici TMDB movie vs tv): vengono
    risolti prioritariamente su `t: "tv"` poiché rappresentano la serie anime TV (*Bleach*, *Boruto*, *Slime*),
    evitando di marcare come doppiati film occidentali omonimi non correlati (*Anna Karenina*, *Dissection*).
- **Precedenza nel merge** (`src/annotations.js`):
  La funzione `mergeAnnotationRows(base, extra)` opera per chiave `(t, id)` con precedenza:
  `true` > `null` > assente.
  - Una prova positiva per-id di AnimeUnity **vince** su un `null` di AG (risolve l'omonimia);
  - Un `true` esistente **non viene mai declassato**;
  - L'output è ordinato stabilmente per `(t, id)`.
- **Degrado e guardia**:
  Se MongoDB non è raggiungibile o viene passato `--no-anime`, il giro si conclude regolarmente annotando solo
  Antonio Genna ed emettendo un avviso esplicito di degrado. La **guardia del writer** (−2% soglia calo `true`)
  impedisce di sovrascrivere un file precedente ricco con uno impoverito dall'assenza della sorgente anime (calo
  misurato: −2,4%, exit code 2).

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
  **merge** nel catalogo ha invece scelto di non bloccare mai il dump: due posti diversi, due decisioni;
- in dry-run non scrive niente e riporta quante righe scriverebbe.

## Uso

```bash
node cli.js --dry-run                     # parsing + match + unione anime, non scrive niente
node cli.js --dry-run --no-anime          # esegue solo Antonio Genna senza unione anime
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
| `--mongo-uri <uri>` | URI MongoDB per la collezione anime_airing_state (default: env MONGODB_URI) |
| `--no-anime` | disattiva l'unione anime (produce unicamente annotazioni AG) |

## Verifica reale (01/10/2026)

Esecuzione reale con indici in cache e MongoDB connesso:

| Metrica | Antonio Genna (base) | Unione AnimeUnity | Risultato finale |
|---|---|---|---|
| Voci / Documenti | 25.165 voci uniche | 902 anime doppiati | **24.105 righe** |
| **`true`** | 19.126 record | +436 aggiunti · +38 promossi da null | **19.600 record** (+474) |
| `null` | 4.543 record | -38 promossi a true | **4.505 record** |
| `already true` | — | 428 confermati da entrambe | — |
| Record catalogo analizzati | 106.700 (89.829 film, 16.871 serie) | — | — |

Tempo totale impiegato: **~6,2 secondi**.

```bash
node --test tests/   # 47 test, tutti verdi
```

I test coprono:
- Tre regole di parsing AG (lettera decorativa, inversione articolo, anno di disambiguazione);
- Quattro percorsi di match e rifiuto rumore fuzzy;
- Regola doppiaggio anime identica al core (`src/data/animeAiringState.js`);
- Risoluzione `t: 'movie'` per film anime fuori dal dump TV;
- Helper `mergeAnnotationRows` (precedenza `true` > `null` > assente, nessun declassamento, ordinamento `(t, id)`);
- Degrado con avviso quando Mongo non è disponibile;
- Formato NDJSON, atomicità writer e guardia sul calo dei `true`;
- CLI flags e battito di salute.
