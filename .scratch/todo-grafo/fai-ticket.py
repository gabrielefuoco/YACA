"""fai-ticket.py — l'effort `todo-grafo`: la mappa e gli otto ticket per eseguire `todo grafo.md`.

La terza risposta dell'esperto contiene cinque cose: i tre bug silenziosi di `bolle-nitrile` (§0),
la soluzione in due mosse per le serie (§1), la mappa 6+2 (§2), il congelamento di V7 (§3), i tre
contratti (§4) e i due script che chiudono prima di `src/` (§5).
"""
import pathlib

E = pathlib.Path(".scratch/todo-grafo")
(E / "issues").mkdir(parents=True, exist_ok=True)
(E / "ricerche").mkdir(exist_ok=True)
(E / "log").mkdir(exist_ok=True)

(E / "map.md").write_text("""# todo-grafo — eseguire la risposta dell'esperto

## Destination

Eseguire per intero `todo grafo.md`, la terza risposta dell'esperto. Contiene cinque cose:
i **tre bug silenziosi** di `bolle-nitrile` (§0), la **soluzione in due mosse per le serie** (§1),
la **mappa a 6+2** al posto della tassonomia 4+2 (§2), il **congelamento di V7** (§3), i **tre
contratti automatici** che impediscono agli artefatti di ripetersi (§4), e i **due script** che
chiudono il cerchio prima di `src/` (§5).

Esito atteso: la partizione (V7 o la sua corretta), le serie collocate a freddo con un numero
onesto, la mappa finale, e i contratti che rendono impossibile il settimo artefatto.

## Decisions so far

- **I tre bug sono reali**, verificati sul codice il 14/10/2026:
  - `genres` manca da `COLS_M` **e** `COLS_T` (`bolle.py` 476-479) mentre viene letto a riga 513:
    `GEN` e' l'insieme vuoto per tutti i titoli, quindi la maschera di genere tagliava solo sulle
    keyword, e le firme `pg:paese|decennio|genere` perdevano il genere. **La colonna esiste nei
    parquet**: la correzione e' aggiungere `"genres"` alle due liste.
  - `min_sim_kw=0.12, min_sim_cast=0.12` con `con_shrinkage=True` in `10-vicinanza.py`: coi coseni
    schiacciati a ~[0, 0.25] dallo shrinkage, 0.12 taglia quasi tutto `CAST`. Nel modulo canonico
    il default e' gia' 0.02: **il bug e' nel chiamante**, non in `bolle.py`.
  - `potatura_nucleo`: `fuori.getrow(r)` legge solo meta' degli archi quando `M` e' il triangolo
    superiore. L'autore lo sapeva (l'helper `versus` gestisce il triangolo), ma non li' dentro.
  - **Quarto bug, non segnalato:** `costruisci_insiemi` legge `networks`, `production_countries` e
    `production_companies` e il `return` non le restituisce. Il network e lo studio — cioe' il modo
    piu' diretto di nominare il mondo di una serie — sono calcolati e buttati via. E' la ragione
    meccanica dietro l'osservazione §1.2 dell'esperto.
- **I parquet hanno molte piu' colonne di quelle usate**: `recommendations` (di TMDB), `spoken_languages`,
  `writers`, `original_language`, `type`, `ita`, `watch_providers_it`, `vote_average`.
- Il timore dell'esperto che le serie non abbiano `networks` e' **infondato**: c'e', ed e' gia' letto.
- Il taglio del 76,3% di `DIR` si e' rivelato benefico *a lettura*, ma era un effetto del bug.
  La correzione va **misurata**, non assunta migliore: il confronto V7/V8 decide.
- V7 va **congelato** solo se V8 non lo batte. L'esperto dice RB 100 definitivo (Ticket 09):
  RB 200 frantuma, RB 60 cola.

## Not yet specified

- Se correggere i tre bug migliori o peggiori la partizione: si misura.
- Il valore di `lambda` nella fusione diretto+ponte, e se convenga tararlo sulle sentinelle o
  sul banco delle 600.
- Se `networks` da solo basti per le bolle-serie, o serva anche `production_companies`.
- Se i centroidi vadano pesati per purezza interna come suggerisce l'esperto, o se il peso lineare
  peggiori (una bolla pura e una contaminata riceverebbero lo stesso vettore medio).

## Out of scope

- `src/`: nessuna modifica al prodotto. Questo effort chiude il prototipo.
- La tassonomia "4 canonici + 2 vibe": da buttare (§2), non da riparare.
- Rimpicciolire le bolle: no, 162 e' la dimensione del prodotto (§3).
""", encoding="utf-8")

TICKETS = [
(1, "I tre bug e il quarto: verifica sul codice", "task", """Verificare, una per una, le accuse di §0 di `todo grafo.md` **contro il codice vero**, non
contro la copia che l'esperto ha letto (i numeri di riga non tornano: il file e' cambiato).

Per ciascuna: il bug c'e' o no, e **quanto pesa**.

1. `genres` assente da `COLS_M`/`COLS_T`: confermato a lettura. Quanto pesa? Quanti titoli hanno
   `GEN` vuoto (atteso: tutti), e quanti archi `DIR`/`CAST` la maschera avrebbe lasciato passare
   **se** il genere ci fosse. La domanda vera: la maschera di genere, riparata, taglia di piu' o
   di meno di quella rotta?
2. `min_sim=0.12` con shrinkage: e' **nel chiamante** `10-vicinanza.py`, non nel default di
   `bolle.py` (0.02). Misurare il grado mediano di `CAST` a 0.02 e a 0.12, e quanti archi si perdono.
3. `potatura_nucleo` e il triangolo: confermato a lettura. Quanti nodi espulsi vengono riassegnati
   leggendo solo meta' degli archi, e in quante bolle cambierebbe l'esito usando `peso + peso.T`.
4. **Il quarto, non segnalato:** `costruisci_insiemi` legge `networks`, `production_countries` e
   `production_companies` e non le restituisce. Elencare cosa e' calcolato e buttato via.

Esito: `ricerche/01-bug.md` con i quattro verdetti e i numeri, e `01-bug.py` che li produce.
Non correggere niente: la correzione e' il ticket 02."""),

(2, "I bug corretti: nasce V8, e si misura contro V7", "task", """Correggere i quattro difetti e rigenerare la partizione (V8), poi **confrontarla con V7**.

Correzioni:
- `"genres"` in `COLS_M` e `COLS_T`
- `min_sim` coerente con lo shrinkage nel chiamante che serve la mappa
- `potatura_nucleo`: `fuori = (peso + peso.T).tocsr()` per la riassegnazione (la `versus` e' gia' giusta)
- restituire `RETE`, `PAE`, `COMP` da `costruisci_insiemi`, e lasciare che le usi chi serve

Il confronto V7 verso V8 va fatto **sulle metriche che contano**, non sul numero di bolle:
le 20 sentinelle (quante leggono un mondo nominabile), il banco dei 600 film (il 27,7% nella
propria bolla, lo 0,0% di scollegati), la mediana della dimensione, la purezza media, e il tempo.

Decisione esplicita alla fine: **V8 sostituisce V7, o V7 resta congelato?** L'esperto dice di
congelare V7 (RB 100), ma dice anche che la correzione dei bug va fatta: se V8 peggiora, si tiene
V7 **e si annota perche'**."""),

(3, "I tre contratti nel codice canonico, e il retro-test sui sei artefatti", "task", """Trasformare i controlli manuali in contratti automatici (§4), e **dimostrare che avrebbero
fermato i sei artefatti storici**. Il secondo punto e' quello che conta: un contratto che non
fallisce su un bug vero non e' un contratto.

1. **Anti-pareggio** dentro `canone.py:ranghi()` e prima di ogni `argsort`: se il top-50 di una
   colonna e' costante, `AssertionError`. (Il bug della maschera sulle serie e l'inversione di
   `verifica-popolare.py` sarebbero morti qui.)
2. **Tasso base**: un helper in `canone.py` che accetta una funzione di predizione e restituisce
   `(H_oss, H_caso, lift, kappa)` con `H_caso` da permutazione. Da usare **sempre** al posto di una
   percentuale nuda. (Il 79,4% di adiacenza delle bolle e' l'artefatto che questo avrebbe smascherato.)
3. **Non-vuotezza**: `assert_componente` in `bolle.py` sul grado mediano e sulla copertura, chiamato
   dopo la costruzione di `GEN`/`KW`/`CA`/`SIG`. (`genres` mancante e `CAST` azzerato a 0.12
   sarebbero morti qui.)

Retro-test: rieseguire i sei artefatti con i contratti attivi e riportare, per ciascuno, quale
`assert` lo ferma. Se qualcuno non viene fermato, il contratto e' incompleto: dire quale parte manca.
Esito: `ricerche/03-contratti.md`."""),

(4, "I 349 centroidi TF-IDF delle bolle-serie", "task", """Costruire il vettore centroide `mu_b` per ogni bolla a maggioranza serie (§1.B.1).

Contenuto, come chiede l'esperto, ma verificando quali colonne servono davvero: `keywords`,
**`genres` (ripristinati)**, `networks`, `production_companies`, `production_countries`,
`original_language`, `cast`, `created_by`.

Punti da decidere con una misura, non a intuito:
- il numero vero di bolle a maggioranza serie (l'esperto dice 349: verificare)
- se pesare i membri per purezza interna (una bolla pura e una contaminata riceverebbero lo stesso
  vettore medio) o se il peso lineare basti
- la normalizzazione: che il coseno diretto sia confrontabile fra bolle di dimensioni diverse

Controllo di leggibilita': stampare i primi termini di una decina di centroidi e **guardare se
nominano un mondo** (la bolla di *Banana Fish* dovrebbe avere anime/seinen/MAPPA/JP). Se i centroidi
non sono nominabili a occhio, il vettore e' sbagliato, e si vede qui e non al ticket 05.
Esito: `04-centroidi.npz` + `ricerche/04-centroidi.md`."""),

(5, "Il voto diretto: di quanto sale il 2,2% delle serie", "task", """Misurare il voto 1 su banco vero: le 600 serie nascoste, collocate **solo** col coseno
contro i 349 centroidi.

Confronto con le tre baseline gia' misurate:
- studente dei film sulle serie: 2,2% nella propria bolla (1,8% scollegate)
- studente delle serie: 1,3% (0,2% scollegate)
- caso: 0,062%

E col **tasso base** che l'esperto pretende, non una percentuale nuda: `(H_oss, H_caso, lift, kappa)`,
piu' il confronto fra le due strade (voto diretto, ponte) bolla per bolla: su quante serie i due
voti sono d'accordo, su quante il diretto vince dove il ponte fallisce e viceversa. Il disaccordo
e' l'informazione: dice quale strada serve davvero a chi.
Esito: `ricerche/05-voto-diretto.md`."""),

(6, "Il ponte film-serie e la fusione dei due voti", "task", """Costruire il ponte e fonderlo col diretto (§1.B.2 e §1.B.3).

- `BB_film->serie`: la matrice di adiacenza fra le bolle-film e le bolle-serie, normalizzata come
  dice l'esperto (`BB~`, righe normalizzate) perche' una bolla-film con 40 archi non deve valere
  quanto una con 3.
- `S_ponte(s, b) = somma su b_film di P(b_film | s) * BB~(b_film, b)`, dove `P(b_film | s)` viene
  dallo studente dei film, che fa il 27,7%.
- Fusione: `S_diretto + lambda * S_ponte` sulle 349 bolle-serie, argmax. **Tarare `lambda`** su una
  parte del banco e verificarlo sull'altra, invece di scegliere il valore che fa piu' bella la
  tabella: se il `lambda` migliore e' 0 o infinito, la risposta e' che una delle due strade e' inutile.

Riportare anche le due popolazioni separate: dove il ponte esiste (il 58,7%) e dove il mondo e'
solo-serie (il 41,3%). Se il diretto risolve i solo-serie e il ponte porta il resto, l'esperto ha
ragione; se no, dire dove sbaglia.
Esito: `ricerche/06-ponte-fusione.md`."""),

(7, "La mappa a 6+2, simmetrizzata", "task", """Salvare la mappa finale come dice §2 e §5.2: **6 vicini intra-medium + 2 ponti cross-medium
simmetrizzati**, invece della tassonomia 4 canonici + 2 vibe che a questa granularita' non esiste.

Il ponte cross-medium va **forzato simmetrico**: se la bolla-film *Guerre stellari* sceglie la
bolla-serie *The Mandalorian*, allora *The Mandalorian* deve vedere *Guerre stellari* fra i suoi due
ponti, anche se ha otto bolle-serie con peso maggiore. E' il difetto §2.4, ed e' deterministico
da riparare.

Poi ricalcolare `(purezza, pct_locale)` del ticket 14 sulle bolle della partizione finale
(V7 o V8, secondo l'esito del ticket 02) e rifare la mappa `.npz`.

Controllo: verificare che i 2 ponti cross-medium non siano due volte la stessa bolla, che le bolle
senza ponte siano dichiarate (non riempite a caso) e che *Guerre stellari* e *The Mandalorian*
si vedano in entrambi i versi.
Esito: la mappa `.npz` nuova + `ricerche/07-mappa-6-2.md`."""),

(8, "Congelamento e report", "task", """Chiudere: decidere e **scrivere** cosa e' congelato, con i numeri che lo giustificano.

- qual e' la partizione finale (V7 o V8) e perche'
- la mappa finale (6+2) e il file `.npz`
- il numero onesto dell'inserimento: film e **serie**, con `lift` e `kappa`
- i tre contratti attivi, e i sei artefatti che ora muoiono
- cosa resta aperto prima di toccare `src/`

Il report e' `ricerche/08-congelamento.md`; `map.md` va aggiornato con la decisione in cima.
Se emerge che qualcosa non e' pronto, va **detto qui** e non lasciato credere."""),
]

for n, titolo, tipo, corpo in TICKETS:
    slug = titolo.lower().replace(" ", "-").replace(",", "").replace(":", "")[:44]
    (E / "issues" / f"{n:02d}-{slug}.md").write_text(
        f"Status: ready-for-agent\nType: {tipo}\n\n# {n:02d} — {titolo}\n\n{corpo}\n",
        encoding="utf-8")

print(f"creati {len(list((E/'issues').glob('*.md')))} ticket:")
for f in sorted((E / "issues").glob("*.md")):
    print("  ", f.name)
