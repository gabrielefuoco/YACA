# eterogeneo — la trama come arco del grafo, e la collocazione unificata

## Destination

Realizzare l'architettura dell'utente: **un unico grafo eterogeneo** dove gli embedding di trama sono un
**tipo di arco** come KW, CAST, CF. Rafforzare la **coerenza intra-cluster** e avere collegamenti
pesati fra cluster che indichino contenuti simili; usare gli stessi archi per **collocare i titoli
nuovi senza suggerimenti di visione**.

## Decisions so far

- **La trama come arco funziona**: 1.648.356 archi (grado mediano 30, la forma di CAST), 13 secondi.
  Il controllo di leggibilità è convincente: *Toy Story* → *Toy Story 3 · 2 · 4* in ordine.
- **Il payload «titolo + trama»** è quello che rende possibile il caso saga: con la sola trama il
  modello non le vedeva.
- **V10 = 1.783 bolle** (V8: 1.625), ricetta identica + il componente a peso 1,0. 503 s.
- **La coerenza intra-cluster migliora del 23%**: PMI mediana +0,653 → **+0,803**. È l'obiettivo
  dell'architettura, e è confermato.
- **La frammentazione è mista**: lo spaghetti western quasi dimezza (11,39 → 6,32), il thriller
  psicologico migliora (101,78 → 92,53), ma l'iyashikei peggiora (7,81 → 10,10). E N_eff sale per
  costruzione con più bolle, quindi una parte dell'aumento è meccanica.
- **Nella collocazione il voto di trama PEGGIORA**: 63,0% → 57,0% (sui 334 casi misurabili: 62,0% →
  58,1%). Non è un artefatto di copertura: il confronto è sugli stessi casi.
- **I due risultati non si contraddicono**: il banco chiede «atterra dove la co-visione l'aveva messo?»
  e il voto di trama sposta verso la bolla **semanticamente** più vicina. È lo stesso disaccordo
  V1/V3, alla stessa distanza.

## AGGIORNAMENTO 15/10 — le bolle più piccole vincono, e la lettura manuale ribalta il banco

**RB 200 (col componente di trama) è meglio su tutto:**

| | V8 (RB100) | V10 (RB100) | **V10 (RB200)** |
|---|---|---|---|
| bolle | 1.625 | 1.783 | **2.838** |
| mediana | 33 | 29 | **16** |
| la più grossa | 552 | 543 | **341** |
| **coerenza intra-cluster** | +0,653 | +0,803 | **+0,944** |

**+44% di coerenza**, e il ticket 09 di `bolle-nitrile` («RB 200 frantuma») è **smentito**: lo diceva
su una partizione senza il componente di trama e con le metriche vecchie.

**La collocazione migliora**, letta a occhio su 100 uscite 2024+: le saghe vengono trovate
(*Deadpool ×4*, *Toy Story ×4*, *Mad Max*, *Mission Impossible* conf 0,61, *Mortal Kombat ×4* conf
0,39), i mondi sono più precisi (i flop DC insieme, la saga Shyamalan per *Trap*, i drammi sportivi
per *Challengers*, il tema greco per *Odissea*). Tre regressioni, tutte «sbagliato ma coerente»:
*Sonic 3* → i Thor, *Conclave* → L'esorcista, *Kung Fu Panda 4* → gli speciali TV.

**IL BANCO VA RIBALTATO**: dice 27,7% per i film, l'occhio dice ~90%. Il banco chiede «atterra dove la
co-visione l'aveva messo?» — domanda che per un titolo fuori dal grafo **non ha risposta**. Misura il
comportamento, l'occhio il significato, e sui titoli nuovi esiste solo il secondo.

**Un errore mio, che è una scoperta**: leggevo i membri delle bolle su V10 coi centroidi costruiti su
V8. Le bolle **non hanno id stabili fra partizioni** — *Deadpool & Wolverine* "finiva" tra i telefilm
americani. Il contratto `assert_allineamento_spazi` non ha protetto perché la **partizione** non era
nell'elenco degli artefatti. **Partizione, centroidi e vocabolario sono un artefatto solo.**

## Le tre domande dell'utente (15/10)

**1. Cosa sono i titoli senza trama?** Non roba scadente: sono i **poco votati** (mediana **26** voti
contro **127** di chi ha una trama; sopra i 1000 voti: **0,2%** contro 14,4%). I più votati senza trama
sono **telenovelas latinoamericane** (*Rebelde* 5.213, *El señor de los cielos*, *El Chavo del Ocho*,
*Avenida Brasil*) e **commedie francesi** (*Le Jeu, Les Tuche, Brice de Nice, Les Bronzés*) — popolari
nei loro mercati, minori per noi. Nella lettura degli inserimenti, *Il conte di Montecristo* finiva con
*Le Jeu* e *Les Tuche*: **correttamente**, e senza trama.

**2. Gli altri componenti li coprono?** **Sì**, e bene:

| componente | copre (con trama) | copre (senza trama) |
|---|---|---|
| KW | 94,9% | **88,8%** |
| CAST | 97,2% | **93,4%** |
| DIR | 76,9% | 61,9% |
| PROD | 75,4% | 66,3% |
| TV (co-visione) | 66,6% | 37,3% |
| LIST (curate) | 22,4% | **5,9%** |
| COLL | 11,0% | 6,3% |

Il componente di trama è quindi un **di più**, non una necessità: i metadati coprono l'88-93% anche di
chi non ha una trama. Quello che non li raggiunge è il **comportamento** (TV 37%, LIST 6%) — perché
sono titoli che nessuno ha ancora guardato.

**3. Le bolle ancora grandi.** A RB 200 il problema è **quasi risolto**: sopra i 200 titoli restano
**2 bolle** (604 titoli, **0,9%** del canone), sopra i 120 sono 31 in tutto (6,3%).

| fascia | bolle | titoli |
|---|---|---|
| 200+ | **2** | 604 (0,9%) |
| 150-200 | 5 | 823 (1,2%) |
| 120-150 | 8 | 1.055 (1,6%) |
| 100-120 | 16 | 1.733 (2,6%) |
| 60-100 | 180 | 13.207 (19,9%) |
| 30-60 | 551 | 22.580 (34,1%) |

E le dieci più grosse sono **incoerenti**, ma per una ragione precisa: hanno **19-28% di titoli con una
trama** contro il 54% del canone — sono i **contenitori dei titoli senza trama**, dove i metadati sono
sottili e il comportamento non arriva. **Il rimedio non è una risoluzione più fine** (RB 400 romperebbe
le bolle buone): è **più segnale** per quei ~600 titoli, che oggi non esiste.

## Not yet specified

- Il **peso del componente**: provato solo a 1,0. 0,5 e 2,0 cambierebbero la coerenza, e vanno misurati
  prima di congelare V10.
- Il **ricalcolo del vicinato** quando arriva un titolo nuovo (il punto «da valutare»): richiede di
  ripartizionare, quindi appartiene al ciclo notturno.
- Se il voto di trama vada usato **solo** per i titoli senza comportamento, e con quale peso: il test
  sono le uscite 2026, che il banco non può misurare.

## Out of scope

- Toccare `src/`: la scelta resta job notturno offline.
- Sostituire gli altri componenti: la trama ne è uno in più, e copre il 54% del canone.
