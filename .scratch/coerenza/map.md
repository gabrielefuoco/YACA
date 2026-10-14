# coerenza — eseguire la quarta risposta del senior

## Destination

Tradurre in misure le quattro domande di `handoff-senior-4.md`, come chiede il senior, e provare i
cinque interventi che ne derivano. In particolare: **un arbitro automatico della qualità semantica**,
che non usi la co-visione (perché per un titolo nuovo non esiste) e che non usi le feature del
collocatore (perché altrimenti si autoconferma).

## Decisions so far

- **Il limite è la partizione, non il metodo** (confermato dal senior §1): in V8 i capolavori del
  thriller psicologico sono «sequestrati» dalla bolla 820 dal pubblico generalista (l'attrattore
  comportamentale «chi guarda Fincher guarda anche Nolan» batte quello tassonomico), e gli altri
  thriller restano orfani in venti bolle.
- **I due livelli sono la soluzione strutturale** (§2), non un compromesso: una partizione globale e
  un vicinato locale risolvono problemi geometricamente incompatibili. Con un raccordo preciso:
  dentro una bolla grande, ordinare per `purezza · pct_locale` **moltiplicato** per `(1 + cos(x, j))`.
- **Il banco non è l'arbitro** (§3): la sua «bolla vera» è nata dal comportamento, quindi premiare la
  coerenza semantica *peggiora* il banco mentre migliora la qualità.
- **I contratti di non-degenerazione non bastano** (§4): il 63,7% e il 58,27% erano errori
  **relazionali** — array di output bellissimi che violavano un'identità rispetto agli input.
- **Due ostacoli al §3.1, misurati il 14/10/2026:** l'`overview` manca per il **58,8%** dei film e il
  **51,5%** delle serie; e le trame presenti sono **in italiano** mentre `bge-small-en-v1.5` è un
  modello **inglese**. La metrica va costruita tenendone conto, e il campione va dichiarato.

## Eseguito, 14/10/2026 — 4 ticket su 10

**Le due metriche di coerenza ci sono e funzionano**, e la prima corregge il senior:

- **N_eff** misura quanto un **tag** coincide con un **mondo**, non quanto un mondo è coeso. In cima
  i franchise (super sentai 1,17 · Bond 1,23 · Ultraman 1,41), in fondo i modi che tagliano il
  catalogo (revenge 418 · love 354). Le previsioni del senior — noir 2,1, thriller 18,5 — sono
  sbagliate di un ordine di grandezza: misurano **35,35** e **101,78**. La banda utile è **5-25**.
- **L'indice di chimera** funziona (col filtro di supporto `df ≥ 30`, che mancava) e **conferma
  §5.2**: le più chimeriche sono tutte bolle grandi con generi incompatibili
  (`documentary + action + thriller`). Non conferma la bolla 594: serve una misura per membro.

**Il §5.1 va corretto**: il **top-M peggiora** (32,0% → 28,5%) e **non esiste** una distorsione
geometrica (con V3 la correlazione dimensione/successo è **+0,003**). L'**ibrido coi top-5 esemplari
funziona**: **33,2%** (+1,2), con **+7,7 punti** sulle bolle oltre i 120 titoli. E la prima misura
dava **55,8%**: era data leakage, il terzo della sessione.

**I tre contratti relazionali** di §4 fermano 4 casi su 4, zero falsi allarmi — e uno di loro ha
fermato il 55,8% la prima volta che è stato applicato.

## Eseguito anche il 07 — i falsi vicini sulla mappa

**La divisione per taglia funziona** (i falsi giganti cadono di tre ordini di grandezza), **il coseno
fra centroidi no**: positivo nel 99,7% delle coppie, e sulla bolla 525 mette *Miss Bala* al primo
posto con 0,755 mentre i vicini veri stanno a 0,65-0,70. La coerenza va misurata **fra esemplari**
(`max cos` fra i membri): con quella *Miss Bala* va a 0,130 e il talk show recupera *Letterman* e
*Jeopardy!*. Due casi su tre si separano; il terzo (i *Flintstones* col true crime) no, perche' la
misura eredita le debolezze dei pesi V3 — probabilmente il cast.

La mappa coerente **resta navigabile** (una componente) ma ha ginocchio **1,16** contro 1,24: due
mappe per due scopi, come i due livelli del collocatore.

## Restano: 04 (la coerenza sulla trama), 05 (le promozioni), 08 (V9), 09 (bolle-continente e
## chimere, che adotta la coerenza per esemplari coi soli token tematici), 10 (consolidamento).

## Not yet specified

- Se il sub-clustering ricorsivo sulle bolle >60 titoli (senza toccare RB 100) sia praticabile nei
  tempi, o se convenga prima il top-M del centroide.
- Se il modello multilingue serva davvero, o se su un testo italiano `bge-small-en` dia comunque un
  segnale *relativo* utilizzabile (si misura, non si assume).
- Quanto costi il sub-clustering in memoria: V8 è già stato costruito al limite della macchina.

## Out of scope

- Toccare `src/`: resta la proposta, non l'implementazione.
- Rifare la partizione da zero: si parte da V8.
- Il ponte film→serie: misurato e bocciato.
