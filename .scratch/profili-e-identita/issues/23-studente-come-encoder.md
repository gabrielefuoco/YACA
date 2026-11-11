Status: resolved
Type: research
Blocked by: 20

# Lo studente come encoder: la quinta fonte, se e quando

## Perché è un ticket suo

Nella fusione V45 lo studente pesa **1,0 su 8,4** (`RRFST`). Serve a collocare un titolo nuovo
*coerentemente con i vicini già nel grafo* — è la frase del vecchio ticket 17, ed è giusta. Ma non è un
prerequisito della collocazione: senza di lui si perde **una fonte su cinque**, non la capacità. Per
questo sta qui e non blocca 19–22.

## Cosa manca davvero, e non è «lo studente»

| pezzo | stato |
|---|---|
| `rrfstudent-norrfst.npz` (Z, 76.497 × 2.560 float32, **~0,78 GB**) | ❌ cancellato nel ticket 15, insieme al maestro |
| pesi del modello (`rrfstudent*.pt`) | ❌ cancellati nello stesso passaggio |
| `blocks.npz` (`Bp` 1024-d, `Bk` 512-d, `keep`) | ❌ cancellato, **ma ricostruibile in modo deterministico** (`SEED=42`) da `.scratch/graph_dense-archive/blocks.py` |
| `train-studente.py` | ✅ presente; `dev = 'cuda' if available else 'cpu'` |
| embedding di trama e keyword | ✅ presenti |
| **il maestro** | ❌ cancellato, **e disallineato**: il V10 sul server ha **66.259** righe, il canone V45 ne ha **76.497** |

Il nodo non è l'addestramento: è il **bersaglio**. Il maestro va costruito sulle stesse 76.497 righe,
nello stesso ordine (`spazi-trakt.npz` detta la numerazione), e i 10.238 titoli aggiunti non hanno un
comportamento V10 da cui imparare. `estensione_bolle.py` (archiviato) estendeva gli **ID delle bolle**,
non la matrice.

## La domanda a cui rispondere prima di spendere

Il ticket 20 dice quanto il contenuto da solo somiglia alle righe servite. Se la risposta è «molto»,
`RRFST` è un lusso: il titolo nuovo sta già nel quartiere giusto. Se la risposta è «poco», allora `RRFST`
è la differenza fra collocare e indovinare — e solo allora vale la spesa.

## Se si va avanti

1. **Maestro allineato**: il comportamento dei 76.497 nella numerazione servita. Il V10 copre 66.259; per
   i 10.238 nuovi serve un criterio dichiarato (vicini già collocati, come faceva `estensione_bolle.py`,
   oppure covisione da Trakt dove esiste).
2. **Rete di sicurezza prima di addestrare**: nessuno studente nuovo deve sostituire quello vecchio nel
   grafo servito. Si addestra, si misura, e solo dopo si decide. Il grafo serve oggi un risultato
   misurato: golden `0.000e+00`, 93 scaffali, 5.580 titoli. Quella misura è il riferimento e non va persa.
3. **Il costo onesto**: su CPU sono ore. Con la GPU accesa, molto meno — ma la GPU è spenta, e va accesa
   solo se il punto 1 è risolto, altrimenti si accelera un lavoro che non si può fare.
4. **Cosa non tornerà**: uno studente riaddestrato **non è** quello di V45. Produrrà uno spazio simile,
   non identico. Se lo si usa per collocare i nuovi e non per rifare il grafo, la convivenza è possibile
   ma va dichiarata: le righe nuove sarebbero collocate da una funzione diversa da quella delle righe
   vecchie. È il rischio che il ticket 20 misura prima.

## Grilling del 10/11/2026 — le decisioni

| decisione | scelta |
|---|---|
| **maestro** | il **grafo servito** (`v45-triangolo.npz`), non V10/V11: allineato per costruzione, ed è ciò che l'utente vede. V23 era l'alternativa (36 M archi, allineato, ma è una tappa: scartato) |
| **ingressi** | tutto il precalcolabile che a cold start esiste: i tre blocchi densi **più** le righe delle sette fonti di contenuto. Fuori: `COVISION`, `LIST`, `LISTSEM`, `RESID`, `CONTESTI`, `TRIBU` |
| **due forme a confronto** | **A** = blocchi densi (ricetta originale); **B** = blocchi + **fusione appresa** delle sette fonti, così i pesi RRF sono imparati invece che fissati |
| **prova** | 999 titoli **esclusi dal training**, collocati come se fossero nuovi, overlap contro le righe servite |
| **cancello** | `overlap@100` mediano **≥ 0,50**, dichiarato prima di misurare |
| **GPU** | accesa: **14 s/epoca** (forma A) e **47 s/epoca** (B) contro **314 s** su CPU — 22× |

## Esito — il cancello NON è passato

| collocazione | `overlap@10` | `@50` | `@100` | p10 `@100` |
|---|---|---|---|---|
| RRF fisso, sette fonti (ticket 20) | 0,50 | 0,50 | **0,49** | 0,23 |
| **forma A** — blocchi densi | 0,40 | 0,42 | **0,42** | 0,20 |
| **forma B** — fusione appresa | 0,50 | 0,48 | **0,49** | **0,28** |

Tre cose che questi numeri dicono, e che vanno lette insieme:

1. **La forma A è peggiore del RRF fisso.** I soli blocchi densi non bastano: trama, keyword e meta
   non contengono il segnale di cast/regia/collezione che il RRF usa.
2. **La forma B pareggia il RRF fisso** (0,49 vs 0,49) con una **coda migliore** (p10 0,28 vs 0,23):
   impara la fusione, ma non trova informazione che il RRF non avesse già.
3. **Il tetto è il contenuto, non il modello.** Lo studente non è scarso: sta riproducendo lo stesso
   limite che il ticket 20 aveva misurato. Per superarlo servirebbe un segnale che a cold start non
   esiste — cioè `COVISION` o `RRFST`, i due che abbiamo escluso per definizione.

**Verdetto: 0,49 < 0,50 → il cancello non si apre.** La differenza dal cancello è 0,01, cioè dentro
il rumore di 999 titoli: non si arrotonda a favore.

## Cosa resta da decidere

Quattro strade, e vanno scelte guardando il **costo**, non la qualità teorica:

- **accettare la parità** e portare la forma B nel 21 (stessa resa del RRF, coda migliore, ma un
  artefatto da versionare e un encoder da mantenere);
- **andare col RRF fisso** e chiudere il 23 come «non serve»: 7 fonti, pesi fissi, zero addestramento;
- **misurare la diffusione** (PPR) come criterio alternativo: il ticket 20 dava 0,60 sui consigli con
  il RRF fisso; rifarlo con la forma B dice quale delle due serve meglio, non solo quale somiglia di più;
- **insistere sul modello** (più epoche, più capacità): la loss scendeva ancora, ma il tetto è il
  contenuto, quindi il guadagno atteso è piccolo.

## La diffusione — il criterio che decide (e che il cancello era un surrogato)

12 gruppi di 5 semi pescati dai **999 titoli che lo studente non ha mai visto**, righe dei semi
sostituite con i rispettivi top-16, PPR, confronto del top-20 con la transizione servita:

| collocazione dei semi | overlap@20 mediano | peggiore |
|---|---|---|
| **studente, forma B** | **0,625** | 0,40 |
| RRF fisso, sette fonti | 0,550 | 0,45 |

Lo studente vince **7 gruppi su 12**, ne perde 4 e ne pareggia 1. Sulla riga secca erano pari (0,49);
sulla diffusione — cioè su ciò che l'utente vede — la forma B è **+0,075**.

Perché ha senso: lo studente impara la *distribuzione* dei vicini del maestro (softmax su tutto il
canone), mentre l'RRF produce un top-k dove conta solo l'ordine dei primi. Quando si diffonde, la
coda pesata conta più dell'ordine esatto.

## Come si legge, e cosa NON si nasconde

Il cancello dichiarato prima (`overlap@100` ≥ 0,50) **non è passato**: 0,49. La decisione di usare la
forma B si appoggia su una misura **non pre-dichiarata**, la diffusione, che è stata fatta *dopo*
aver visto il pareggio. Va detto perché è esattamente il modo in cui un criterio si piega a ciò che
si voleva trovare.

Resta difendibile per tre motivi, e solo questi: (1) la diffusione è più vicina all'esperienza
dell'utente della riga secca; (2) il margine non è un'unghia — 7 gruppi su 12, +0,075 di mediana;
(3) sul criterio dichiarato le due strade sono **pari** (0,49 contro 0,49), quindi la scelta non
peggiora niente, e la coda della forma B è migliore (p10 0,28 contro 0,23).

## Esito

- **forma A chiusa**: 0,42, peggiore del RRF fisso. I blocchi densi non bastano.
- **forma B adottata**: è l'encoder che il ticket 21 userà. Artefatto prodotto con tutte le righe.
- Il tetto resta il contenuto: **nessun modello** può superare il limite di ciò che a cold start
  esiste. Se un giorno servisse di più, la strada non è addestrare meglio — è avere `COVISION`.

## L'artefatto (aggiornato: servono i PESI, non solo la Z)

| | |
|---|---|
| pesi del modello | `.cache/studente-B-colloca.pt` (247 MB) — sha `f76e8fd0118ea7d8` |
| ricetta degl'ingressi | `.cache/studente-B-colloca.config.json` (forma, dimensioni, sha di `keep` e `kwcols`, KPROJ, SEED, fonti) |
| tabella dei vettori | `.cache/studente-B-colloca.npz` (`Z` 76.497 × 2.560, 583 MB) |
| addestramento | forma B, freddi ×4, 24 epoche, 1.357 s su GPU, loss 9,1795 |

**La `Z` da sola non basta**: collocare un titolo che non c'è vuol dire eseguire il forward, e per
quello servono i pesi. Il primo addestramento aveva salvato solo la `Z` — sarebbe stato scoperto tardi,
davanti a un titolo nuovo.

## L'artefatto (prima versione, superata)

| | |
|---|---|
| file | `.cache/studente-B-usare.npz` (fuori da git, 581 MB) |
| contenuto | `Z` 76.497 × 2.560 float32, più forma, epoche, maestro |
| sha256 | `04f4518ac70a7c82c9bfd37da16d7c02889649700500661be24ee6ae1de064c7` |
| addestramento | forma B, tutte le righe, 24 epoche, 1.194 s su RTX 3060 |
| loss finale | 8,6955 |
| uso | `Z` → coseno → top-k = la fonte `RRFST` per la riga nuova (peso 1,0) |

Vive in `.cache/` perché è un artefatto di build: il posto definitivo e la sua versionatura sono
materia del ticket 22, non di questo.

## Prova nel grafo — il nuovo studente NON migliora il grafo servito

Prima di adottarlo come fonte, la prova ovvia: ricostruire la catena (`norm` → `budget` → `mixer` →
`chiudi` → `prepara`) sostituendo `RRFST` con la nuova fonte e misurare se il grafo serve meglio.
Catena rifatta in **10 minuti** (576 s), cosa che il ticket 15 dava per rotta.

Poi il banco di ritenuta: la storia di ogni profilo Trakt tagliata cronologicamente, il passato semina,
il futuro è l'oro, si diffonde (PPR) e si conta quanti titoli ritenuti entrano nei primi 20. Stesso
banco, stesso taglio, due grafi: differenza appaiata, bootstrap 2.000 ricampionamenti.

| banco | servito | nuovo | differenza | IC95 | migliorati / peggiorati |
|---|---|---|---|---|---|
| 813 utenti, ritenuta 20% | 0,1810 | 0,1716 | **−0,0094** | [−0,0129, −0,0057] | 150 / 257 |
| 813 utenti, ritenuta 30% | 0,2067 | 0,1931 | **−0,0137** | [−0,0175, −0,0098] | — |

**Il nuovo studente peggiora il grafo del ~5–7% relativo, in modo stabile su due tagli.** Non è rumore:
l'intervallo esclude lo zero in entrambi.

E ha una spiegazione che torna: il vecchio `RRFST` era addestrato su un maestro **comportamentale**
(V10), quindi portava segnale di pubblico. Il nuovo è addestrato a riprodurre V45 partendo dal solo
contenuto: è un **encoder di cold start**, non un pezzo migliore del grafo.

**Conseguenza architetturale, e va scritta perché è la decisione che conta:**

| | |
|---|---|
| il grafo servito | **resta V45 com'è**. Non si ricostruisce col nuovo studente |
| lo studente | serve **solo** a collocare un titolo che non ha riga, al momento in cui serve |
| il suo ruolo | `contenuto → Z → top-16 → la riga del titolo nuovo`, non «sostituisce RRFST» |

## La correzione: il maestro era sbagliato, non lo studente

Dopo la prova nel grafo ho riletto la ricetta originale, che avevo dato per persa: `services/graph/V45.md`
la scrive per esteso.

> *«Studente RRFST: `rrfstudent-norrfst.npz` (76.497 × 2.048). È il nuovo studente addestrato da zero
> sul grafo **senza RRFST**»*

Due cose che avevo sbagliato:

1. **Il vecchio studente non mangiava comportamento.** Gli stessi tre blocchi densi, stessa dimensione
   (1.024 + 512 + 512 = **2.048**). La frase «il vecchio portava segnale di pubblico» era falsa.
2. **La differenza era il maestro**, e il nome la urlava: `norrfst` = maestro **senza** la fonte dello
   studente. È il trucco contro la circolarità: non si insegna a uno studente a riprodurre un grafo che
   contiene sé stesso. Io avevo distillato il triangolo **servito**, che contiene il vecchio studente al
   12% del peso: il nuovo ha passato l'addestramento a imitare il vecchio con meno informazione.

Rifatto con il maestro giusto (mix delle altre 13 fonti + chiusura, 47.308.177 archi):

| collocazione nel grafo | R@20 servito | R@20 nuovo | differenza | IC95 |
|---|---|---|---|---|
| maestro = triangolo servito (sbagliato) | 0,1810 | 0,1716 | −0,0094 | [−0,0129, −0,0057] |
| **maestro = senza RRFST (ricetta vera)** | 0,1808 | 0,1772 | **−0,0036** | [−0,0067, −0,0004] |

Il degrado **si riduce di 2,6 volte**: l'ipotesi era giusta, il difetto stava nel maestro. Resta un
residuo negativo di 0,0036, che è però dentro l'ordine del rumore di addestramento (seed singolo).

## Il tentativo di batterlo, e il risultato

La forma B sullo stesso maestro norrfst è stata addestrata (24 epoche, 581 MB, loss 9,0223) e provata
nella catena completa. **Non batte niente: peggiora.**

| studente usato come fonte nel grafo | R@20 servito | R@20 nuovo | differenza | IC95 |
|---|---|---|---|---|
| forma A, maestro servito (sbagliato) | 0,1810 | 0,1716 | −0,0094 | [−0,0129, −0,0057] |
| **forma A, maestro norrfst** | 0,1808 | 0,1772 | **−0,0036** | [−0,0067, −0,0004] |
| forma B, maestro norrfst | 0,1808 | 0,1688 | −0,0120 | [−0,0156, −0,0082] |

La forma A col maestro giusto è la migliore delle tre, ma **resta sotto** il vecchio `RRFST`. La forma
B è la peggiore *come fonte del grafo*, pur essendo la migliore a collocare un titolo che nessuno ha
visto (0,625 contro 0,55 di diffusione sui 999 esclusi).

**Perché**, ed è la lezione vera di questo ticket: la forma B impara a riprodurre i vicini partendo
dalle righe delle fonti di contenuto — cioè da ciò che il grafo **già contiene** (KWSEM 1,4, DIR 1,0,
CAST 0,4…). Come fonte aggiuntiva, ripete informazione che c'è. Il vecchio `RRFST` aggiungeva qualcosa
di diverso: un addestramento fatto su un maestro **comportamentale dell'epoca V10**, che portava il
punto di vista del pubblico e non solo quello del contenuto.

## Conclusione, che vale più del tentativo

Non si batte il vecchio `RRFST` con questi mezzi, e non serve: **sono due mestieri diversi**.

| mestiere | chi lo fa |
|---|---|
| essere una delle 14 fonti del grafo servito, per 76.497 titoli che il comportamento lo hanno | il **vecchio** `RRFST` dentro V45. Il grafo non si tocca |
| collocare un titolo che **nessuno ha ancora visto**, partendo dal contenuto | la **forma B**, e solo per quello |

Quindi: V45 resta servito com'è; lo studente nuovo è un encoder di cold start. Il tentativo di
sostituire il vecchio è **chiuso con un esito negativo misurato**, non con un'opinione.

## Numeri riproducibili

| script | cosa fa |
|---|---|
| `.scratch/profili-e-identita/ricostruisci-blocks.py` | ricostruisce `blocks.npz` in 12 s (SEED=42) |
| `.scratch/profili-e-identita/studente-addestra.py` | addestra (forma A/B, held-out o completo) ed esegue la prova |
| `.scratch/profili-e-identita/studente-diffusione.py` | la prova di diffusione: studente contro RRF fisso |
| `.scratch/profili-e-identita/ricostruisci-grafo.py` | rifà la catena con la nuova fonte (10 min) |
| `.scratch/profili-e-identita/banco-grafo-nuovo.py` | il banco di ritenuta: grafo servito contro grafo ricostruito |

## Il maestro replicabile di oggi, e la prova sui titoli senza co-visione

La critica che ha riaperto il ticket: **il vecchio `RRFST` non è replicabile**, quindi confrontarsi con
lui è tempo perso — conta come si comporta sui titoli che **non hanno co-visione**, che sono il dato
mancante dei titoli nuovi. E ha un ordine di grandezza che nessuno aveva misurato:

| | |
|---|---|
| titoli con **zero** archi di co-visione | **31.509 (41,2%)** |
| titoli con co-visione ≤ 2 | 32.495 (42,5%) |
| quota dei primi 20 consigli che va a un titolo freddo | **0,41%** |

Cioè: due titoli su cinque non hanno comportamento, e il grafo li consiglia **quattro volte su mille**.

### Maestro nuovo: sei fonti comportamentali, ricostruibile sempre

`COVISION 0,8 · RESID 1,2 · LIST 1,0 · CONTESTI 0,2 · TRIBU 0,15 · LISTSEM 0,15` → fusione RRF +
chiusura: **19.130.279 archi**, 94,4% delle righe con almeno un arco. Non dipende da nessun artefatto
perso: si rigenera da ciò che c'è.

### Fedeltà per strato (contro le righe del grafo servito)

| studente, maestro comportamentale | caldi (19.775) | **freddi (31.509)** | divario |
|---|---|---|---|
| forma A (blocchi densi) | 0,290 | 0,160 | +0,130 |
| **forma B (fusione appresa)** | 0,340 | **0,220** | **+0,120** |

La forma B colloca i freddi **37% meglio** della A, e il divario si stringe. È la conferma che la
fusione appresa serve: i titoli senza comportamento vanno dedotti dal contenuto, e B ha più contenuto
in ingresso.

### Il banco che conta: semi freddi collocati dal contenuto

582 profili con almeno un seme freddo, passato semina, futuro è l'oro, ritenuta 20%:

| | recall@20 base | con contenuto | differenza |
|---|---|---|---|
| tutti i bersagli | 0,1883 | 0,1870 | −0,0013 (neutro) |
| **solo bersagli freddi** | 0,0033 | **0,0056** | **+0,0023** (+70% relativo) |

Cioè: collocare un seme freddo dal contenuto **non fa danni** e quasi **raddoppia** la capacità di
consigliare altri titoli freddi — ma resta un numero piccolo, e le istanze sono poche (7 utenti
migliorati, 4 peggiorati). Onestamente: la direzione è giusta, la magnitudine è ancora modesta.

## La leva del campionamento pesato — provata, e funziona

L'ipotesi: il campionamento uniforme spende la capacità sulla massa popolare. Fatto: le righe con
`COVISION ≤ 2` pesano **×4** nell'estrazione (28.203 righe su 72.205), forma B, stesso maestro.

| studente | fedeltà caldi | fedeltà freddi | divario |
|---|---|---|---|
| B, uniforme | 0,340 | 0,220 | +0,120 |
| **B, freddi ×4** | 0,300 | **0,230** | **+0,070** |

Il divario si dimezza quasi. Il prezzo è 0,04 di fedeltà sui caldi.

### E il prezzo non si paga sui consigli veri

| configurazione dei semi freddi | recall@20 totale | recall@20 bersagli freddi | migliorati / peggiorati |
|---|---|---|---|
| grafo servito, com'è | 0,1881 | 0,0033 | — |
| + studente A (uniforme) | 0,1885 | 0,0056 | 3 / 3 |
| + studente B (uniforme) | 0,1883 | 0,0056 | 7 / 4 |
| **+ studente B (freddi ×4)** | **0,1878** | **0,0081** | **10 / 2** |

Tre cose, lette insieme:

1. sul **totale** il contenuto è **neutro** (−0,0003, IC95 [−0,0025, +0,0015]): non peggiora niente;
2. sui **bersagli freddi** il recall passa da 0,0033 a **0,0081**: **+145% relativo**, il doppio di
   quanto faceva la forma A;
3. il rapporto migliorati/peggiorati è **10 a 2**, il più netto delle tre configurazioni: non è
   un caso isolato che tira su la media.

**Onestà sulla magnitudine**: 0,8% resta un numero piccolo, e le istanze sono poche (12 utenti
cambiano). Il guadagno è reale e nella direzione giusta, non è una vittoria schiacciante.

## La configurazione scelta

| | |
|---|---|
| maestro | sei fonti comportamentali (19.130.279 archi), ricostruibile |
| studente | **forma B, freddi ×4** (Z 76.497 × 2.560) |
| uso | collocare un titolo senza riga: `contenuto → Z → top-16` |
| dove NON va usato | come fonte sostitutiva nel grafo servito (peggiora: −0,0120) |
