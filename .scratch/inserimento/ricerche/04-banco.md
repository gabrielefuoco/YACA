# Ticket 04 — il banco di prova

Script: `04-banco.py`. Il ticket chiedeva 10-15 titoli recenti **e un controllo misurabile**. Il
controllo c'è, ed è il risultato più forte di tutto l'effort.

## A. Il controllo: 600 titoli tolti dal grafo e ricollocati

Si toglie il comportamento a 600 titoli, si **nasconde il loro contributo al modello** (riaddestrato
senza di loro), si proiettano dai soli metadati, e si guarda dove cadono rispetto alla bolla da cui
vengono. Il test è **semantico** — il ticket 02 ha mostrato che confrontarsi con lo spazio CF sarebbe
misurare la cosa sbagliata.

| | |
|---|---|
| torna nella **propria** bolla | **166/600 — 27,7%** |
| cade in una bolla **adiacente** sulla mappa | **434/600 — 72,3%** |
| cade in una bolla **non collegata** | **0/600 — 0,0%** |
| **nel quartiere giusto (propria + adiacente)** | **600/600 — 100,0%** |
| caso, per la propria bolla | 1/1.617 = 0,06% |

**Zero volte su seicento il titolo finisce in un mondo che non è il suo.** Il 27,7% centra la bolla
esatta, il resto cade in una bolla **vicina** — che è quello che ci si aspetta da una partizione in
cui un mondo può essere diviso in due (il ticket 20 di `grafo-servibile` l'aveva già misurato).

## B. I casi patologici, letti

| titolo | dove finisce | vicini |
|---|---|---|
| **Project Hail Mary** (2026) | fantascientifico spaziale | Interstellar, Project Gemini, Gravity, Moonfall, Passengers |
| **Obsession** (2026) | horror | Lights Out, Oculus, Slender Man, The Grudge, It Follows |
| **Michael** (2026) | biopic musicale | **Elvis, Judy**, I Saw the Light, Whitney, Vox Lux |
| **Odissea** (2026) | epico mitologico | **Troy, La furia dei titani, Scontro tra titani, Gods of Egypt** |
| **Super Mario Galaxy** (2026) | animazione | Ratchet & Clank, Ralph spacca Internet, I Puffi 2, I Croods 2 |
| **Spider-Man: Brand New Day** (2026) | supereroi | No Way Home, X-Men Apocalisse, Guardiani della Galassia, Civil War |
| **VERITY** | thriller psicologico | **Gone Girl**, Il castello di vetro, Il segreto dei suoi occhi |
| **Любовь-морковь** (nicchia, pochissime keyword) | cinema russo | Спортлото-82, Ёлки 3, Love and Pigeons, Служебный роман, 12 стульев |
| **Quantum Supremacy** (nicchia) | animazione/fantascienza | Monster Hunter, Trollhunters, Babylon 5 |
| **Due spicci** (serie TV 2026) | ✗ | Resident Evil, Endgame, Infinity War, Interstellar |
| **GIGN - Forze speciali** (serie TV 2026) | ✗ | *gli stessi* |
| **Michael Jackson: il verdetto** (docuserie) | ✗ | *gli stessi* |

**Nove su dodici sono ottimi.** E il caso più bello è il titolo russo con pochissime keyword: i suoi
vicini sono **tutti russi**. Un titolo di nicchia senza metadati ricchi trova il suo mondo.

## C. Il fallimento, e la sua causa esatta

I tre casi che sbagliano sono **tutti serie TV**, e finiscono **tutti nella stessa bolla** con gli
**stessi vicini**. Misurato:

> **film con comportamento (`Cf` non nullo): 49.041**
> **serie con comportamento (`Cf` non nullo): 0**

Lo studente è `metadati → Cf`, e **`Cf` viene da MovieLens**, che non ha serie. Quindi lo studente
**non ha nessuna serie su cui imparare**: per una serie predice il vettore medio del catalogo, e tutte
le serie nuove finiscono negli stessi vicini. E' esattamente il fallimento osservato, e non è un caso.

**E il comportamento delle serie esiste, ma altrove:**

| | film con archi | serie con archi |
|---|---|---|
| `boot-B` (Trakt) | 14.235 | **14.723** |
| `nuovo-TV` (co-visione) | 22.900 | **12.315** |

## Cosa serve

**Un secondo studente `metadati → B` (o `→ TV`) per le serie**, addestrato sullo spazio del
comportamento Trakt invece che su MovieLens. È la stessa costruzione del ticket 01 (`features.py`
c'è già, i vocabolari sono congelati, la Ridge è una riga) applicata a un altro target. Finchè non
c'è, **il cold start vale per i film e non per le serie** — e le serie sono uno dei due cataloghi del
prodotto.
