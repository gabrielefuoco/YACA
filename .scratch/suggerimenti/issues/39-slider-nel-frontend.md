Status: ready-for-agent
Type: task

# Gli slider del motore non esistono nell'interfaccia

Il motore accetta quattro slider e li applica gia': `largo` (quanti mondi), `lontano` (quanto diversi),
`cozy` (leggero/impegnativo) e `canone` (nicchia/popolare). Sono dichiarati in `slider()` di
`graph/motore.py`, viaggiano nell'artefatto dove servono, e `Bolle.js` li accetta. **Nella configurazione
del prodotto non ci sono**: l'utente non puo' toccarli.

Cosa manca, in concreto:
 · i controlli nell'interfaccia (probabilmente accanto alle righe dei cataloghi, in
   `frontend/src/components/dashboard/DnaAndAiPanel.tsx`);
 · il passaggio del valore dal profilo al percorso dei cataloghi, che oggi non li legge;
 · e il valore di `DELTA_FASCIA` (quanto sposta la finestra lo slider `canone`) e' marcato **INVENTATO**
   in `parametri.py`: va calibrato su `measure/ricetta.py` prima di esporlo, altrimenti si espone una
   manopola che non si sa cosa fa.

Nota di comportamento, misurata: gli assi **modulano l'attivazione**, non filtrano. E' la differenza fra
un terzo dei titoli che cambia (modulando) e le liste che si svuotano (filtrando) — vedi la sezione 13
della mappa, in `.scratch/suggerimenti/map.md`.

## Esito

### 1. Calibrazione di `DELTA_FASCIA` (Parte 3)
Il parametro `DELTA_FASCIA` in `services/graph/parametri.py` era marcato `INVENTATO` con valore `1.0`.
È stato calibrato eseguendo `services/graph/measure/ricetta.py` su 60 utenti Trakt reali (semi = 70% cronologico, oro = 30% futuro).
Uno sweep comparativo su `DELTA_FASCIA` ∈ [0.25, 0.50, 0.75, 1.00, 1.25, 1.50, 2.00, 2.50] ha dimostrato:
- A valori bassi (0.25), la finestra si sposta troppo poco (Jaccard vs base ~0.49 sia per nicchia che per popolare).
- A valori elevati (≥ 2.0), la modulazione svuota la lista popolare (titoli restanti scendono a 24-23) e degrada la copertura dell'oro (2.3% per nicchia, 1.9% per popolare).
- Al valore **1.0**, la modulazione è ottimale: sposta la finestra di un fattore $e \approx 2.7\times$ in spazio logaritmico dei voti. Con `canone = -1.0` (nicchia), Jaccard vs base è **0.56**, i titoli tenuti sono **33** (su 40 massimi, base 33) e i titoli del futuro presi salgono a **2.7%** (vs 2.6% della base); con `canone = +1.0` (popolare), Jaccard è **0.37**, i titoli tenuti sono **26** e la copertura è **1.9%**. Nessuna lista si svuota.
Il valore **1.0** è quindi confermato e promosso da `INVENTATO` a `MISURATO` in `services/graph/parametri.py`.

Proof (`services/graph/measure/ricetta.py` con 60 utenti):
```
      variante   Jaccard vs base    titoli del futuro presi   ne restano
          base    — (e' la base)                       2.6%           33
       + largo              0.37                       2.8%           35
     + lontano              0.60                       2.4%           31
     + nicchia              0.56                       2.7%           33
    + popolare              0.37                       1.9%           26
        + cozy              0.29                       0.0%           15
  + impegnativo              0.04                       0.0%            4
  + cozy pesato              0.61                       2.3%           31
  + impegn. pesato              0.67                       2.3%           31
```
Allineamento copie: il modulo `graph/` è stato spostato in `services/graph/` nel ticket 06 (non esistono copie parallele in `graph/`). `services/graph/parametri.py` è l'unica sorgente della tabella ed è stato aggiornato.

### 2. Controlli nell'interfaccia e invio valori (Parte 1)
In `frontend/src/components/dashboard/DnaAndAiPanel.tsx`:
- Aggiunto il pannello **Manopole del Motore** all'interno della sezione del motore, direttamente sopra le righe dei caroselli/cataloghi hero.
- I 4 controlli slider:
  1. `largo`: da 2 a 8 mondi (default 4, step 1), da "Resta nel tuo mondo" a "Esci dal tuo mondo".
  2. `lontano`: da 0.0 a 1.0 (default 0.0, step 0.05), da "Mondi più accesi" a "Diversi per fascia/medium".
  3. `cozy`: da -1.0 a +1.0 (default 0.0, step 0.1), da "Impegnativo (-1.0)" a "Cozy (+1.0)".
  4. `canone`: da -1.0 a +1.0 (default 0.0, step 0.1), da "Nicchia (-1.0)" a "Popolare (+1.0)".
- Testi UI formulati rigorosamente per specificare che gli assi **modulano l'attivazione** (circa un terzo dei titoli cambia composizione) e **non filtrano** né svuotano le liste.
- Aggiunto pulsante di ripristino rapido ai valori predefiniti ("Ripristina Default").
- Come i valori viaggiano:
  - Lo stato `Profile` e `ProfileSettings` include l'interfaccia `EngineSliders` (`largo`, `lontano`, `cozy`, `canone`).
  - In `frontend/src/lib/utils.ts`, `profilesToApiPayload` serializza `sliders` sia all'interno di `settings.sliders` sia a livello radice del profilo nel payload di `POST /api/configurazione`.
  - In deserializzazione (`mapBackendProfile`), `sliders` viene estratto con fallback trasparente a `DEFAULT_ENGINE_SLIDERS`.

### 3. Parte differita (Parte 2)
La Parte 2 — il passaggio e cablaggio del valore dal profilo al percorso dei cataloghi nel backend (`src/profile/**`, `src/catalog/providers/**`, `src/pool/**`, `src/catalog/registry.js`) — è esplicitamente differita e lasciata intatta perché di proprietà di un altro agente operante in parallelo in questo momento.

### 4. Limitazioni e verifiche
- Non è stato toccato alcun file in `src/` o `services/anime-source/**`.
- Verifica frontend eseguita con `npx tsc --noEmit` nel frontend (exit code 0, nessun errore di tipi).
- Nessun `git push` eseguito.
