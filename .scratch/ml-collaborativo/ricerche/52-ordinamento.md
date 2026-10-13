# 52 — L'ordinamento: 2,14× al @100 e 11,8× al @10

**Il mandato**: il cesto di candidati è buono (77,23% dei film veri nel top-2000), l'ordine no. Misurare e migliorare l'ordine.

**Esito**: con un modello addestrato **solo sulla calibrazione** e riportato **solo sulla verifica**, il @100 passa da **16,19% a 34,62%** e il @10 da **0,59% a 6,99%**. E il guadagno maggiore non viene dal modello: viene dall'**usare un'altra pesatura del grafo per ordinare**.

Script: `ordine-1.py` (557 s, estrae le caratteristiche) · `ordine-2.py` (132 s, prova gli ordinamenti).

---

## 1. Il disegno

Grafo migliore (`CF + Kc + B + T + K`, report 49). Per 1.000 utenti di calibrazione e 1.000 di verifica (disgiunti dagli archi), si prende il top-2000 dell'attivazione e si estraggono 12 caratteristiche per candidato, **calcolate senza guardare l'oro**. Poi si prova a riordinare quel cesto.

Metrica: recall@N sul **totale dei film veri dell'utente** (≈63, di cui ~50 nel cesto), così i numeri sono confrontabili con i report 47-50.

## 2. I risultati (tutti sulla VERIFICA, 1.000 utenti)

| ordinamento del cesto | @10 | @100 | @500 |
|---|---|---|---|
| **attivazione (ordine attuale)** | 0,59% | **16,19%** | 49,37% |
| popolarità (vote_count) | 2,60% | 15,58% | 43,39% |
| voto medio TMDB | 0,54% | 8,68% | 35,87% |
| coseno col centroide **comportamentale** del profilo | 4,58% | 21,19% | 50,33% |
| quanti film del profilo "votano" il candidato (vicinato CF) | 3,46% | 17,85% | 48,35% |
| **attivazione sul SOLO componente comportamentale (`att_cf`)** | **5,84%** | **28,75%** | **61,82%** |
| `z(att_cf) + z(popolarità)` | 5,95% | 30,12% | 63,38% |
| regressione logistica (24 caratteristiche) | 6,36% | 31,37% | 62,31% |
| **GBM, 200 alberi (24 caratteristiche)** | **6,99%** | **34,62%** | **66,30%** |
| *ORACOLO (ordine perfetto dello stesso cesto)* | *14,86%* | ***57,13%*** | *76,56%* |

**GBM: calibrazione 7,48 / 35,71 / 68,07 — verifica 6,99 / 34,62 / 66,30.** Il divario calibrazione-verifica è di mezzo punto: la differenza è segnale, non adattamento.

**Il GBM chiude il 45% del divario al @100** (da 16,19 a 34,62 su 57,13) e **il 52% al @10**.

## 3. La scoperta più utile non è il modello

**Lo stesso grafo, pesato diversamente, ordina molto meglio.** L'attivazione sul grafo completo dà 16,19% al @100; l'attivazione sul **solo componente comportamentale** dà **28,75%** — con lo stesso cesto e le stesse informazioni.

Il motivo è nella ricetta: la curatela pesa **0,60**, ed è giusto per *trovare* il cesto (è la massa che porta i titoli giusti dentro il top-2000) ma è **veleno per l'ordine** — porta in cima i 3.417 film scritti a mano, che non sono quello che gli utenti guardano.

Cioè: **il grafo ha due mestieri e va pesato due volte.** Recupero e ordinamento non vogliono la stessa matrice. E la seconda è **gratis** — nessun modello, nessun dato nuovo, un'altra pesatura della stessa struttura.

## 4. Le caratteristiche che pesano

Pesi della regressione logistica (valore assoluto): `voto_z` 1,71 · `voto_raw` 1,39 · `grado_z` 0,89 · `cf_voti_z` 0,83 · `anno_z` 0,83 · `att_cf_z` 0,75 · `cos_prof_raw` 0,69 · `cf_cent_z` 0,67.

Tre cose:
1. **Il voto medio TMDB è la caratteristica più pesante** — l'utente guarda roba *buona*, e questo è il primo segnale di "qualità in sé" che emerge in tutta la sessione (che pure l'utente aveva escluso dagli assi).
2. **Il comportamento conta**: `att_cf` e `cf_voti` insieme pesano più di qualunque cosa.
3. **Il coseno coi metadati (`cos_prof`) pesa poco**: l'ultima conferma che il contenuto non ordina.

## 5. Limiti dichiarati

- **Il GBM è addestrato sul comportamento degli utenti MovieLens e valutato su quello.** In produzione va riaddestrato sui dati YACA. Quello che si porta a casa non sono i pesi: è **la struttura** (`att_cf` + popolarità + voto + vicinato CF), che è trasferibile, e la misura del margine.
- L'oracolo @100 (57,13%) **non è raggiungibile**: è il tetto a informazioni perfette. Il 34,62% è a metà strada.
- Le caratteristiche sono calcolate sul cesto dell'attivazione: se cambia il recupero, il modello va rifatto.
- Una riga del primo tentativo era sbagliata e vale la pena dirlo: avevo usato come riferimento l'ordine di `np.argpartition`, che **non ordina** — dava 8,90% invece del vero 16,19%. L'ho visto perché il numero non tornava con la misura del report 47.

## 6. Cosa fare adesso, in ordine

1. **Adottare due pesature**: una per il recupero (la ricetta del report 49) e una per l'ordinamento (la stessa, ma col comportamento in testa). Guadagno immediato, nessun modello.
2. **Il GBM come secondo passo**, riaddestrato sui dati di YACA. Il margine misurato è +18 punti al @100 sopra la pesatura nuova.
3. **Non toccare il grafo per migliorare l'ordine**: sono due mestieri, e il report 49 aveva già mostrato che il grafo è ottimo come recuperatore.
