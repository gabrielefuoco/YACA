Status: ready-for-agent
Type: task

# 45 — Il metro, seconda iterazione: il criterio che discrimina

## Perché

Lo strumento del ticket 43 (`scripts/qa/probe-gusto-holdout.js`) è **buono**: misura `oro_preso`, riempimento,
novità e diversità su OFF e ON, ed è riproducibile. Ma **la misura non è una prova**, e il verdetto
«NUOVA CATENA ACCETTATA» **non sta in piedi**. Tre difetti, verificati:

1. **Il criterio che discriminava era vacuo**: `oro_preso(ON) >= oro_preso(OFF)` con **0% contro 0%** → sempre
   vero. Gli altri paletti li soddisferebbe qualunque lista non vuota.
2. **La spiegazione è falsa per le serie**: l'oro contiene **Yu Yu Hakusho** (voto 7.49 · 240 voti · pop 7) che
   **rispetta** la definizione di `hidden_gems` (voti ≤ 1000 · pop ≤ 20 · voto ≥ 7) e **non è stato preso**. Quindi
   la causa non è «sono blockbuster»: è da **trovare**.
3. **Il campione è minimo**: oro = **2 film** e **5 serie** → `oro_preso` può valere solo 0/50/100%.

## Cosa deve uscire

1. **Il gold AMMISSIBILE**: l'oro va filtrato con **le stesse regole del motore** (definizione `hidden_gems`,
   politica anime, kids) — e va dichiarato quanti titoli restano. Su un oro che il motore **non può** prendere, la
   metrica misura il vuoto: è il difetto n. 2 visto dall'altro lato.
2. **Il difetto strutturale della fuga, risolto**: il profilo **vivo** contiene i titoli dell'oro, e il motore
   esclude ciò che è già visto → l'oro è **escluso prima di misurare**. Serve una variante in cui **semi, profilo e
   insieme dei "visti" sono SOLO il passato** (70%), per **entrambi** i motori. Se il vecchio motore non accetta un
   profilo in memoria (`catalogStrategies.buildHiddenGemsCatalog` richiama `fetchProfileContext`), **dirlo** e
   misurare almeno la variante nuova contro il limite superiore del vecchio, dichiarandolo.
3. **Il criterio dichiarato PRIMA, e non vacuo**: deve poter essere **falso**. Es. *«`oro_preso(ON) ≥ oro_preso(OFF)`
   **e** almeno un titolo dell'oro ammissibile preso»*, oppure una soglia assoluta. Commit separato, prima di
   eseguire.
4. **La causa del titolo non preso**: perché Yu Yu Hakusho (e gli altri ammissibili) non entra? Generi dominanti
   del profilo? Filtro di allineamento VSM? Cap di diversità? Cap del pool? **Una misura, non un'ipotesi.**
5. **N utenti, non 2**: dopo il ticket 44 il corpus Trakt è di nuovo disponibile → la ricetta sui **60 utenti**
   (seme 404) o su quanti se ne possono usare, con **media e distribuzione**, non un aneddoto.
6. **Il verdetto onesto**: se il vecchio vince, si scrive. E se la nuova catena non è migliorabile a costo
   ragionevole, il piano del ticket 41 cambia (si migra solo dove non peggiora, o si ferma la migrazione).

## Dipendenza

Il punto 5 richiede il **ticket 44** (il corpus). I punti 1–4 si possono fare **subito** sui 2 utenti di Mongo,
e sono quelli che correggono il verdetto.

## Come si verifica

La sonda rieseguita (comando nel ticket), col criterio scritto **prima**, e i numeri di OFF e ON **sugli stessi
insiemi**: oro ammissibile, `oro_preso`, riempimento, novità, diversità — per i due utenti, poi per la coorte.

## Cosa si confronta (decisione dell'utente, 18/10/2026)

**`nicchia_di_qualita` (grafo) contro `hidden_gems` (vecchio motore)** — cioè **ciò che il grafo sostituisce
davvero**, non una variante del nuovo fornitore contro sé stessa. Metrica: `oro_preso` (e riempimento, novità,
diversità). Criterio dichiarato **prima**, non vacuo.

### L'asimmetria, da dichiarare e non aggirare

| motore | di cosa ha bisogno | su quanti utenti si può misurare |
|---|---|---|
| **vecchio** (`hidden_gems`) | un **profilo di gusto su Mongo** | **2 utenti reali** |
| **grafo** (`nicchia_di_qualita`) | i **semi** dalla cronologia + il servizio | **400 utenti** del corpus Trakt (ticket 44 ✓) |

Quindi la misura si fa su **due piani**, dichiarandoli entrambi:
- **(a) testa a testa** sui 2 utenti di Mongo, con **entrambi** i motori → è il confronto diretto, con n=2;
- **(b) lato grafo** sui **400 utenti** del corpus → è la **distribuzione**, senza il vecchio.

Un confronto su un piano solo sarebbe una mezza verità: (a) ha il rivale ma non la numerosità, (b) ha la
numerosità ma non il rivale. Va scritto nel referto quale piano dice cosa.

### Il punto di riferimento (senza il quale la misura diventa archeologia)

Dopo il **ticket 46** `hidden_gems` **sparisce da `main`**: il vecchio motore e il fornitore nuovo vengono rimossi
insieme al catalogo. La misura testa-a-testa va quindi fatta **sul commit precedente** a quel merge — il commit va
**scritto in questo ticket** appena il 46 atterra (il suo Esito lo dichiara).
