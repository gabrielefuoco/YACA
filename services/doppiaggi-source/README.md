# yaca-doppiaggi-source

Scraper degli indici de **Il Mondo dei Doppiatori** (`antoniogenna.net/doppiaggio/`), lettura in sola lettura
della collezione **`anime_airing_state`** (AnimeUnity) e matcher contro il catalogo YACA. Produce le annotazioni
definitive "questo titolo è doppiato in italiano".

È il gemello di `services/anime-source/`: modulo autonomo con CLI e test offline. Ha come unica dipendenza
il driver **`mongodb`** (per leggere lo stato degli anime in sola lettura, esattamente come `anime-source`) e
resta **senza dipendenze native**.

> **Stato**: completo. Scraper, parser, matcher, **unione anime AG ∪ AnimeUnity**, writer e
> **risolutore TMDB ID**. Il file prodotto è un **NDJSON**; il **parquet tipato** lo materializza il **core**
> (che ha già DuckDB) leggendolo: così il modulo resta **senza dipendenze native**. Formato deciso dal ticket 04
> della mappa `.scratch/doppiaggio-ita`.
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
6. **Risoluzione per TMDB ID** (`src/resolver.js`, sottocomando `--resolve-ids`) — risolve le schede AG rimaste
   senza candidato nel catalogo (~3.500 voci) e le annota **anche se fuori catalogo**: la chiave è l'id, quindi
   l'annotazione resta in attesa e diventa visibile quando il record entra in Tier 1.
   - **prova di identità obbligatoria** (titolo italiano, originale o alternativo fra i nomi del record): la
     ricerca da sola sbaglia (`Triple Z` → *The Six Triple Eight*);
   - anno esatto e tipo dalla zona come disambiguatori per gli omonimi;
   - cache su disco, contatore chiamate, ripresa dal punto e budget (`--max-calls`);
   - merge con le annotazioni esistenti via `mergeAnnotationRows` (`true` > `null` > assente).
7. **Diff fra due giri** (`src/diff.js`) — dice **quali titoli hanno cambiato doppiaggio**, cioè quali
   poster vanno rifatti. Non è ancora agganciato al giro: è la funzione e il suo artefatto.

## Unione Anime (AG ∪ AnimeUnity)

Fuori dal catalogo simulcast, il badge anime in YACA sarà la parola **`ITA` secca** letta direttamente dalla
colonna `ita`. Se l'unione non avvenisse nella build del file di annotazioni, un anime doppiato presente **solo**
su AnimeUnity (e non censito su Antonio Genna) perderebbe il badge.

- **Regola del doppiaggio**: identica a quella del core in `src/data/animeAiringState.js:593-611` (`getDubEpisode`)
  e `173-174` (estrazione da `raw.dub` o `italian.dub.latest`, con fallback sull'episodio più recente con
  `dubIta: true` in `episodes[]`).
- **Serie o film? Il dump tv NON basta a dirlo (misurato)**: il dump tv è **filtrato** (Tier 1), quindi una serie
  fuori soglia sparisce e — se lo stesso numero esiste anche come film — il suo id finirebbe annotato come
  `movie`, cioè un badge ITA su un film che non c'entra. Misurato il 01/10/2026 con l'**export TMDB completo**
  (1.251.743 film + 232.806 serie, con i titoli originali): dei 260 id scritti come `movie`, **32 erano serie**
  con una corsa di episodi (`Toushou Daimos` 44 ep → *Europa Europa*, `Kyojin no Hoshi` 182 ep, `Chou Denji
  Robo Combattler V` 54, `Wagamama☆Fairy Mirumo de Pon!` 172), mentre i film veri hanno **1** episodio
  (*Akira*, *Porco Rosso*, *Ponyo*, *Paprika*, *Metropolis*).
  Da qui il **veto**: `maxEpisodeNumber > 3` → è una serie, `t: "tv"`, punto. Dopo la correzione: **228 id**
  mappati `movie` (156 presenti solo nell'export film + 72 in entrambi con ≤ 3 episodi), **zero** con corsa di
  episodi.
- **Volumi reali**: la collezione ha **949 documenti**, di cui **902 anime doppiati** (45 solo sub, 2 con id non
  numerico). 562 id stanno nel dump tv, 72 in nessuno dei due (annotazione in attesa), 214 in entrambi (vince
  `tv`: è la serie).
- **Precedenza nel merge** (`src/annotations.js`): `mergeAnnotationRows(base, extra)` opera per chiave `(t, id)`
  con precedenza `true` > `null` > assente. Una prova positiva per-id di AnimeUnity **vince** su un `null` di AG
  (risolve l'omonimia); un `true` **non viene mai declassato**; l'output è ordinato stabilmente per `(t, id)`.
- **Degrado e guardia**: se MongoDB non risponde o si passa `--no-anime`, il giro si conclude annotando solo
  Antonio Genna ed emettendo un **avviso esplicito**. La **guardia del writer** (−2% sui `true`) impedisce di
  sovrascrivere un file ricco con uno impoverito dall'assenza della sorgente anime (calo misurato: −2,4%,
  exit code 2).
## Il file prodotto

Accanto al dump (dove sta il parquet) nascono due file:

```
ita_annotations.jsonl        una riga per voce, solo true e null
ita_annotations.meta.json    conteggi, timestamp, schemaVersion
ita_annotations.diff.json    i cambi di doppiaggio dell'ultimo giro (scritto da src/diff.js)
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

## Il diff fra due giri (`src/diff.js`)

I poster composti sono file statici serviti come immagini: un file vale per mesi finché il titolo non
cambia. Ma quando un titolo **diventa doppiato** — o **smette** di esserlo — quel file è vecchio, e
aspettare il TTL non è un'opzione. Il diff è la sorgente degli eventi per la coda degli eventi
dell'app (`push({tipo, id, badge})`).

- `computeChanges(righeVecchie, righeNuove)` funzione pura: `false`/`null`/assente → `true` dà
  `{tipo, id, badge: 'ITA'}`, `true` → altro dà `{tipo, id, badge: null}` (**togliere** il badge è un
  evento quanto metterlo), tutto il resto non produce niente;
- **sfrutta l'ordinamento `(tipo, id)`** dei due file (per quello il writer li scrive in ordine):
  il confronto è una fusione a **due puntatori** su sorgenti lazy, quindi in memoria sta solo la
  coppia di righe sotto esame — non 24.000 righe, e il codice non deve sapere quanti titoli ci sono;
- **primo giro → nessun evento**: se il file precedente non esiste il diff è vuoto. Senza questo i
  ~19.000 doppiati del primo giro sembrerebbero "nuovi" e la coda chiederebbe 19.000 poster in un
  colpo. Il vuoto è dichiarato nel log e nell'artefatto (`primoGiro: true`);
- l'esito finisce in **`ita_annotations.diff.json`**, accanto agli altri file, con scrittura atomica
  (`.tmp` + `rename`): `generato`, `cambiati`, `diventatiDoppiati`, `nonPiuDoppiati`, `changes`;
- **tetto di 5.000 cambi per giro**: oltre, è quasi certamente un guasto o un primo giro travestito →
  avviso forte e file scritto **comunque**, con il numero vero dentro (`oltreSoglia`, `avviso`):
  un artefatto che mente sul numero è peggio di un artefatto che ne riporta uno enorme;
- un file che risulta **non ordinato** viene segnalato (`onAnomalia`): la fusione a due puntatori su
  righe disordinate darebbe eventi sbagliati in silenzio.

Non è agganciato al writer (l'aggancio al giro è un passo dopo) e non tocca `ita_annotations.jsonl`.

## Uso

```bash
node cli.js --dry-run                     # parsing + match + unione anime, non scrive niente
node cli.js --dry-run --no-anime          # esegue solo Antonio Genna senza unione anime
node cli.js --health-check                # battito (exit 0 se < 24h)
node cli.js --force-refresh               # ignora la cache e riscarica gli indici
node cli.js                               # giro completo: scrive le annotazioni accanto al dump
node cli.js --resolve-ids --limit 30      # risoluzione a rate per TMDB ID (campione 30)
node cli.js --resolve-ids --max-calls 60  # risoluzione con budget max 60 chiamate
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
| `--resolve-ids` | risolve le schede AG rimaste senza candidato tramite TMDB ID |
| `--limit <n>` | tetto massimo di schede residue da esaminare |
| `--max-calls <n>` | budget massimo chiamate API a TMDB (si arresta senza scrivere se superato) |
| `--tmdb-cache-dir <dir>` | cartella cache risposte TMDB (default: `<cache-dir>/tmdb-api`) |
| `--delay <ms>` | ritardo tra chiamate di rete TMDB in ms (default: 120) |
## Verifica reale (01/10/2026)

Esecuzione reale con indici in cache e MongoDB connesso:

| Metrica | Antonio Genna (base) | Unione AnimeUnity | Risultato finale |
|---|---|---|---|
| Voci / Documenti | 25.165 voci uniche | 902 anime doppiati | **24.119 righe** |
| **`true`** | 19.126 record | +450 aggiunti · +35 promossi da null | **19.611 record** (+485) |
| `null` | 4.543 record | -35 promossi a true | **4.508 record** |
| `already true` | — | 417 confermati da entrambe | — |
| Record catalogo analizzati | 106.700 (89.829 film, 16.871 serie) | — | — |

Tempo totale impiegato: **~6,2 secondi**.

```bash
node --test tests/   # 84 test, tutti verdi
```

I test coprono: le tre regole di parsing (lettera decorativa, articolo invertito, anno di disambiguazione), i
quattro percorsi di match, il rifiuto del rumore nel fuzzy stretto, il caso indecidibile che resta `null`, i
record non toccati che restano `false`, la **chiave `(tipo, id)`**, il formato e l'atomicità del writer, la
**guardia** sul calo dei `true`, il dry-run e il filtro delle cartelle escluse; l'**unione anime** (regola
identica al core, **veto degli episodi**, `t: "movie"` per i film fuori dal dump tv, degrado con avviso quando
Mongo non risponde) e `mergeAnnotationRows` (`true` > `null` > assente, nessun declassamento, ordinamento
`(t, id)`); la **risoluzione TMDB ID** (identità provata via titolo/originale/alternativo, rifiuto quando nessun
nome coincide, ripresa dal punto con cache, arresto a budget raggiunto senza scrivere un file incompleto,
deduplica); il **diff fra due giri** (diventa/smette doppiato, invarianti, righe solo da una parte, **primo
giro vuoto**, file in ordine diverso senza falsi eventi, sorgenti lazy, tetto oltre 5.000 con il numero
vero, scrittura atomica dell'artefatto).