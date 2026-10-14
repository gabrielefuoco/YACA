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
