Status: needs-triage
Type: research

# 43 — Il metro: quale riga è **meglio**, non solo diversa

## Perché

La fetta 1 ha misurato che la riga nuova di `hidden_gems` è **diversa** da quella del vecchio motore: Jaccard
**6,3%** (film) e **9,0%** (serie) — cioè due righe quasi disgiunte. Ma «diversa» **non è** «meglio», e oggi non
esiste **alcun metro** per dirlo.

Senza metro, migrare le altre tre strategie (`trakt_filtered`, `seed_network`, `true_blend`) significa
sostituirle **sulla fiducia** — e il guadagno (3.169 righe in meno) sarebbe pagato con un peggioramento che
nessuno vedrebbe, perché nessuno lo misura.

## Il metro esiste già in casa: la ricetta

`services/graph/measure/ricetta.py` misura la qualità di una riga **sui dati reali di un utente**:

```
semi = il 70% più VECCHIO della cronologia dell'utente
oro  = il 30% più RECENTE (quello che l'utente ha guardato DOPO)
metrica = quanti titoli dell'ORO finiscono nella riga raccomandata  ("oro_preso")
```

Con **60 utenti Trakt reali** come nella ricetta, il numero acquista peso. È la stessa metodologia che ha
permesso di calibrare `DELTA_FASCIA` (ticket 39 di `suggerimenti`) e di dire che gli assi **modulano** invece
di filtrare.

## Cosa deve uscire

1. **Una misura per le righe di gusto** (non per il grafo): dato un utente, tagliare la storia, costruire la
   riga con **OFF** e con **ON**, e contare l'`oro_preso` di ciascuna — più il **riempimento** (quanti titoli
   escono) e la **diversità** (per genere/regista).
2. **Il confronto su N utenti** (non su uno): la media e la distribuzione, non un aneddoto. La sonda attuale usa
   un solo utente (`REOZrGNRr3`).
3. **Un criterio di decisione dichiarato prima di misurare**: cosa fa dire «la nuova va bene» — es. *oro_preso
   non inferiore di più di X punti*, *riempimento ≥ 20*, *nessuna riga vuota*. Deciderlo **dopo** aver visto i
   numeri è il modo di mentirsi.
4. **La risposta scritta**: quale delle due ordina meglio il futuro dell'utente, con i numeri. Se **il vecchio
   vince**, si dice — e allora il piano cambia (si migra solo dove la nuova non peggiora, o si migliora il
   fornitore prima di proseguire).

## Il segnale che rende questa misura urgente

La riga nuova restituisce **75** candidati (film) e **58** (serie) contro **160/160** del vecchio: **metà del
materiale**. Può voler dire *selettività* (bene) o *fame di candidati* (male, se il pool deve riempire più righe
o se i cap di diversità tagliano troppo). Il `oro_preso` distingue i due casi: se i titoli dell'oro ci sono
ancora, la lista è più corta ma più giusta; se spariscono, la lista è solo più povera.

## Perché **prima** delle altre tre strategie

Il costo di una nuova strategia è basso (qualche ora); il costo di scoprire **dopo** quattro migrazioni che le
righe sono peggiori è un ritorno indietro su tutto. Questo ticket rende la decisione **una misura** invece di
una scommessa — ed è la stessa lezione del giorno: *un numero giusto con una spiegazione sbagliata è peggio di un
numero sbagliato*, e qui senza metro non avremmo nemmeno il numero.

## Vincoli misurati (18/10/2026) — la ricetta NON si può ripetere come è scritta

Ho verificato i dati disponibili **prima** di chiedere la misura, perché una misura impossibile si scopre tardi:

| fonte | stato |
|---|---|
| `services/graph/data/` in locale | **vuoto** (i 138 MB stanno sul mate, montati read-only nel container `yaca-graph`) |
| storie Trakt per-utente (`movie-*.json`, `show-*.json` — il `pool` della ricetta) | **non esistono più**: 0 file in locale, 0 in `/srv/yaca/services/graph/data`, 0 nel vecchio clone `/srv/yaca/modulo/` |
| **MongoDB di produzione** (Atlas, db `yaca`) | **2 utenti**, **200** voci di cronologia, 218 item di libreria, 10 profili di gusto |

**Conseguenza onesta**: il `oro_preso` su **60 utenti** non è calcolabile. Su **2 utenti** è **un segnale, non una
prova** — va detto nel referto, non nascosto.

## Il rischio da dichiarare: la fuga del futuro nei semi

Il holdout classico (semi = passato, oro = futuro) presuppone che la riga sia costruita **solo dal passato**. Ma la
riga di produzione nasce dal profilo **vivo**, che contiene **anche i titoli del futuro** (le stesse voci dell'oro):
il `oro_preso` risulterebbe **gonfiato** e il confronto falso.

Quindi il ticket deve dire, per il holdout:
1. se la misura ha **fuga** (riga costruita col profilo intero) → dichiararlo come **limite superiore**;
2. e/o costruire la variante **senza fuga**, escludendo i semi del futuro — se serve un'opzione nuova nel pool,
   **dirlo** invece di aggirarla.

## Cosa deve uscire (aggiornato)

1. **Lo strumento** `scripts/qa/probe-gusto-holdout.js`: dato un utente reale dal Mongo, taglia la cronologia
   (70% vecchio = semi, 30% recente = oro), costruisce la riga `hidden_gems` **OFF** e **ON**, e misura:
   `oro_preso`, **riempimento** (quanti titoli), **novità** (quanti NON sono già in libreria), **diversità**
   (generi/registi).
2. **Il criterio scritto PRIMA** (in un commit separato, prima di eseguire): cosa fa dire «la nuova va bene».
3. **La lettura sui 2 utenti disponibili**, etichettata come **segnale**; e **cosa servirebbe** per una prova
   (più storie: è un problema di **dati**, non di codice).
4. **Se il vecchio vince**, si scrive — e allora il piano cambia.

## Correzione (18/10/2026): il corpus Trakt NON è perduto — è da riscaricare

Nel ticket c'era scritto che il dataset dei 60 utenti «non esiste più» e che la misura **non è più calcolabile**.
**Falso, e me ne scuso**: il corpus è **dato scaricato**, non un prodotto del nostro lavoro — e i programmi che lo
scaricano **sono in git**:

| cosa | dove | stato |
|---|---|---|
| i **7 fetcher Trakt** | `services/graph/fetch/fetch-trakt-{users,followers,full,bulk,lists,movies,related}.js` | **tracciati ✓** — scaricano da `api.trakt.tv` e scrivono in `.cache/trakt/` |
| i **6 generatori dei derivati** | `services/graph/upstream/{00_ratings_puliti,spazi-trakt,cf-edges,contaminazione,boot-comp,componenti-nuovi}.py` | **tracciati ✓** |
| il **manifesto di chi scarica cosa** | `services/graph/fetch/README.md` | **tracciato ✓** — dichiara input, produttore e stato di ognuno |
| MovieLens `ml-32m` | `.cache/movielens/` | dataset **pubblico**, da scaricare a mano |
| gli **artefatti del grafo** (141 MB) | `services/graph/data/` | erano stati cancellati il 18/10 18:14, **ripristinati dal mate** (identici) ✓ |
| grafo delle **keyword** | `src/data/hierarchical_graph.json`, `src/data/entities.json`, `src/indice/keywordIds.js` | **tracciati in git** ✓ |

Quindi la frase giusta è: **il corpus va riscaricato** (tempo + API), non è perduto — e il grafo si può ricostruire.
Il costo vero è un altro: un corpus riscaricato **oggi** non è identico a quello di ieri (Trakt cresce), quindi la
ricetta girerebbe su dati più nuovi — confrontabile in metodologia, non in valori assoluti.
