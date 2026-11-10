Status: ready-for-human
Type: grilling
Blocked by: —

# Cold start: i titoli nuovi nel grafo

Questo è il **genitore**. Le decisioni sono state prese in grilling il 10/11/2026; il lavoro è nei
figli. Non si esegue niente qui.

## Il fatto, misurato

| | |
|---|---|
| canone servito | **76.497** righe (`spazi-trakt.npz`) |
| copertura dei film famosi 2025 / 2026 | 87% / **66%** |
| copertura serie 2025 / 2026 | 96% / 88% |
| cronologia reale dell'account | 21 titoli, **0 fuori canone** |
| titolo fuori canone come seme | **scartato in silenzio** (`engine.py:412`) |

Il buco oggi non morde l'account; morde i titoli che escono da qui in avanti, e chi guarda
soprattutto quelli.

## Le decisioni prese

| | |
|---|---|
| **Il titolo nuovo deve poter entrare nel grafo** | come **seme** è comportamento dell'utente: negargli i vicini significa negare i suggerimenti a chi guarda solo roba nuova. La popolarità è un'altra cosa dall'utilità come sorgente |
| **Assente ≠ debole** | senza riga il titolo nuovo non è «poco consigliato»: è **irraggiungibile**. Con la riga è debole, che è accettabile |
| **Non serve ri-chiudere il grafo** | il runtime simmetrizza al caricamento (`M = (M + M.T)`, `engine.py:186`): una riga asimmetrica produce da sola gli archi inversi |
| **Una fonte vuota non distorce** | in RRF una fonte che non ranka il titolo non somma nulla: la riga fusa è una **votazione parziale**, non una riga di natura diversa |
| **Il contenuto basta per cominciare** | **5,6 di 8,4** di peso della fusione è calcolabile senza comportamento. Mancano `COVISION` 0,8 · `RRFST` 1,0 · `LIST` 1,0 |
| **Widen: si misura, non si discute** | quanto una riga «solo contenuto» somigli a una riga servita lo dice un esperimento sui titoli **già nel grafo**, senza GPU e senza studente |
| **Lo studente non è un prerequisito** | serve a riportare la quinta fonte (`RRFST`, peso 1,0), non a collocare |

## I figli

| # | cosa | stato |
|---|---|---|
| **19** | lo scarto parla: il conteggio esiste già e viene buttato | pronto |
| **20** | collocazione per contenuto, **misurata** sui titoli esistenti | ricerca |
| **21** | pipeline di collocazione di un titolo | dopo 20 |
| **22** | l'incremento si serve senza ricompilare | dopo 21 |
| **23** | lo studente come encoder, se e quando | decisione, dopo 20 |
| **18** | rinominare il triangolo V45 (ha una tagliola) | pronto, indipendente |

## Cosa NON è stato deciso

- La **cadenza** dell'incremento (giornaliera? a mano? a ogni deploy?) — si decide nel 22 guardando
  il costo vero di `prepara.py`, non prima.
- Se l'incremento si **fonde** nel triangolo o resta un **sovrapposto** consultato al caricamento:
  il 22 confronta le due, con l'atomicità e il rollback come requisiti.
- Se lo studente si riaddestra davvero: il maestro è **disallineato** (V10 ha 66.259 righe, il canone
  V45 ne ha 76.497), quindi non è «rigenerare uno studente» ma «costruire prima un maestro
  allineato». Sta nel 23.
