# 45 — Raggiungibilità: i set coerenti vengono raggiunti dall'attivazione?

**Domanda (utente)**: «le foglie piccole sono coerenti? perché in tal caso il problema sarebbe: sono raggiungibili?»

**Risposta**: le foglie piccole sono **coerentissime**. E sì: **la raggiungibilità è il problema, e sta esattamente dove diceva lui** — non nella dimensione né nella coerenza da sole, ma nella loro combinazione. In più, il test ha portato a galla un fatto più grosso: **sul top-10 l'attivazione perde contro una lista di popolarità pura.**

Script: `.scratch/ml-collaborativo/coerenza-foglie.py` · `raggiungibilita.py`.

---

## 1. Coerenza: le foglie piccole sono le migliori, non i residui

Coerenza = somiglianza media fra i membri nello spazio Pc centrato, contro gruppi casuali.

| dimensione | foglie | **COERENZA** | titoli a caso | **PORTATA** (utenti con ≥2 membri) |
|---|---|---|---|---|
| 2-5 | 165 | **0,647** | 0,010 | 2 |
| 6-10 | 594 | **0,682** | 0,004 | 14 |
| 11-20 | 1.264 | **0,709** | 0,002 | 22 |
| 21-40 | 1.051 | **0,682** | 0,004 | 60 |
| 41-80 | 124 | 0,456 | 0,003 | 199 |
| 81-150 | 33 | 0,427 | 0,003 | 299 |
| 151+ | 7 | 0,404 | 0,004 | 1.509 |

**Correlazione coerenza/portata: −0,299.** Le due cose si escludono: più una foglia è coerente, meno gente la frequenta.

**Lettura diretta** (lo script stampa le foglie piccole perché siano lette):

| foglia | coerenza | utenti | titoli | cosa sono |
|---|---|---|---|---|
| 679 | 0,858 | 4 | *Joueuse · Je vous trouve très beau · La fée · Parisienne · On My Way* | cinema francese |
| 504 | 0,905 | 10 | *Tschick · La Crème de la crème · Amici d'infanzia* | commedie teen franco-tedesche |
| 2275 | 0,863 | 12 | *Pippo nel pallone · Le papere di Bugs · Garfield · Heathcliff* | cartoni animati |
| 1352 | 0,785 | 1 | *Un duro per la legge · Day of the Panther · Bloodmatch* | action di serie B |
| 2731 | 0,799 | 1 | *Nobunaga Concerto · Akudama Drive* | azione giapponese |
| 1220 | 0,295 | 217 | *Assassinio sul Nilo · Perfect Stranger · Freies Land* | gialli — la più lasca della lista |

Non sono insiemi casuali: sono insiemi **giusti e piccoli**. Il report 44 diceva "le foglie piccole sono i residui incoerenti": **era falso**, e nasceva dall'aver misurato coerenza e portata con un numero solo (la co-occorrenza), che le confonde.

## 2. Raggiungibilità: il test

Protocollo: **1.500 utenti MovieLens reali** con ≥20 titoli, split casuale 60/40 (profilo/oro), attivazione (RWR) dai film del profilo sul grafo di retrieval, e si guarda il **rango** dei film nascosti. `alpha 0,3 · curatela 0,60` (il peso ottimo per il caso prodotto, misurato in `boot-0`).

**Tre bug miei, tutti intercettati dai controlli** — e sono la parte utile di questa sezione:

1. **Il profilo non era mascherato.** Il top-10 era pieno dei film che l'utente aveva già visto (il seme ha il massimo dell'attivazione sul restart): `@10 = 0,00%` su ogni configurazione. Da qui il mascheramento obbligatorio.
2. **`E` normalizzato per riga**: pesava ogni film del profilo per quante *altre* persone lo hanno. Un peso senza senso che spostava i semi verso i film più idiosyncratici dell'utente.
3. **Mascheramento del blocco invece della colonna**: assegnavo i ranghi di *tutta* la partita di 250 utenti usando l'attivazione di **una sola** colonna. Tutti i numeri di profondità crollavano di ~4×.

## 3. I risultati

**Tutti i 97.893 legami d'oro** (attivazione, senza spezzare per foglia):

| | @10 | @50 | @100 | @500 |
|---|---|---|---|---|
| **attivazione** | 0,26% | 4,92% | **12,33%** | **41,40%** |
| **controllo popolarità** (i titoli più noti del catalogo) | **1,70%** | **5,87%** | 9,91% | — |
| caso uniforme | 0,015% | — | 0,151% | — |

**Sul top-10 l'attivazione perde 6,5 volte contro una lista di popolarità pura**, che è la stessa lista per tutti. Vince solo da ~@100 in poi.

Spezzato per il tipo di foglia in cui sta il film nascosto:

| tipo di foglia | legami | @10 | @50 | @100 | @500 |
|---|---|---|---|---|---|
| **coerenti E piccole (≤20)** | 15.663 | 0,27% | 1,90% | **6,22%** | **27,79%** |
| coerenti E grandi (41+) | 17.183 | 0,45% | 4,60% | **18,47%** | **52,07%** |
| lasche E piccole | 19.278 | 0,15% | 3,90% | 13,46% | 47,29% |
| lasche E grandi | 13.321 | 0,45% | 5,30% | 14,47% | 47,31% |

E le marginali, che mostrano che **nessuna delle due da sola spiega il risultato**:

| | @100 | @500 |
|---|---|---|
| foglie piccole (≤20) | 10,21% | 38,54% |
| foglie medie (21-40) | 10,49% | 36,41% |
| foglie grandi (41+) | 16,72% | 49,99% |
| foglie coerenti (sopra la mediana) | 10,44% | 36,25% |
| foglie lasche (sotto la mediana) | 14,24% | 46,61% |

## 4. Cosa dicono, esattamente

1. **La dimensione aiuta** (+6,5 punti @100 dalle piccole alle grandi): banale, una foglia grande ha più occasioni di essere colpita.
2. **La coerenza *peggiora* la raggiungibilità** (−3,8 punti @100): i set coerenti sono angoli specifici del catalogo, e l'attivazione diffusa ci arriva poco.
3. **La combinazione è quella che morde**: "coerenti e piccole" sta a **6,22% @100** contro **18,47%** di "coerenti e grandi". È un fattore **3**. I set migliori che abbiamo sono i meno raggiunti di tutti.
4. **L'attivazione non è un buon ordinatore di testa**: sotto @10 perde contro la popolarità, e vince solo in profondità. È la stessa tensione che il report 41 aveva trovato sul caso prodotto (`2,26%` contro un caso atteso dell'`1,6%`), e la stessa che l'utente ha nominato: **sorprendente sì, azzeccato no**.

## 5. La lettura, in una riga

Se i set sono coerenti, il problema non è la qualità degli insiemi: è **farci arrivare l'attivazione**. E il punto debole non è generico — è precisamente **le foglie coerenti e piccole**, cioè il 16% dei legami d'oro (15.663 su 97.893), dove l'attivazione perde un fattore 3 rispetto alle foglie coerenti e grandi.

Qualunque cosa si provi adesso va misurata **su quel sottoinsieme**, non sulla media: sulla media un miglioramento generale può nascondere che il sottoinsieme che conta non si è mosso.

## 6. Limiti dichiarati

- Il controllo di popolarità è una **lista globale uguale per tutti**: non è un raccomandatore, e vince sul top-10 perché la metrica misura **cosa le persone hanno davvero guardato**, che è guidato dalla notorietà. Un ordinatore che privilegia la specificità paga su questa metrica per costruzione. Non è una prova che "basta la popolarità": è una prova che **la testa dell'attivazione non è azzeccata**.
- MovieLens copre solo i film (49.736 dei 66.259 titoli): le serie restano fuori da questa misura, e sono lo stesso buco dei report 43 e 44.
- 1.500 utenti su 200.423 disponibili: campione casuale, ma la coda degli utenti molto attivi non è rappresentata.
- Il gold sono i film che l'utente ha **già visto**: la domanda è "cosa guardo dopo", non "cosa mi piacerà" (che è un'altra domanda e un altro gold).
