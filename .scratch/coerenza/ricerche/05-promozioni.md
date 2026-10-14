# Ticket 05 — Promozioni semantiche o errori veri

`Status: resolved` · 14/10/2026 · `05-promozioni.py`

**V1 batte V3 di 18 punti, e questo ribalta la scelta che avevo fatto.** Col leave-one-out esatto su
entrambe le varianti: **V1 = 87,3%** di «non è un errore del collocatore» (63,0% nella propria bolla
+ 24,3% promosse), **V3 = 69,3%** (35,3% + 34,0%).

E il verdetto è **forte**, perché è dato con un metro che favorisce V3: la similarità delle promozioni
usa **generi e keyword** — esattamente i token che V3 pesa ×1,5 e che V1 lascia in balìa delle keyword
rare. Se anche con quel metro V1 vince di 18 punti, non è un pareggio da interpretare.

---

## Il conto

| variante | propria bolla | + promosse | errori veri | «non è colpa del collocatore» |
|---|---|---|---|---|
| **V1 (df ≥ 2, idf pieno, pesi pari)** | **378 (63,0%)** | 146 (24,3%) | 76 (12,7%) | **87,3%** |
| **V3 (df ≥ 3, tetto idf, pesi per tipo)** | 212 (35,3%) | 204 (34,0%) | 184 (30,7%) | 69,3% |

E le promozioni lette, che mostrano cos'è una promozione vera:

| serie | bolla «vera» | bolla predetta |
|---|---|---|
| **Lockup** | bolla 51: *Flora & Ulisse*, *Michael Jackson's This Is It*, *Yu-Gi-Oh!* | **bolla 12: *Ted Bundy*, *American Murder*, *Kai l'autostoppista*** |
| **T@gged** | bolla 164: *Brothers*, *Selena Gomez*, *3096 Tage* | **bolla 224: *Beverly Hills 90210*, *One Tree Hill*, *SKAM NL*** |
| **Grid** | bolla 465: *Perfect Crown*, *Il Tassista*, *낭만닥터 김사부* | **bolla 367: *Black Sea*, *Lezioni vere*, *A Shop for Killers*** |
| **Signal** | bolla 18: *Miss Bala*, *Il postino suona sempre due volte* | **bolla 404: *恋愛寫眞*, *AIBOU: Tokyo Detective*, *Great Teacher Onizuka*** |

*Lockup* nella bolla vera sta con un documentario su Michael Jackson e un cartone giapponese; il
collocatore l'ha messo coi documentari sul crimine. **La promozione è reale**, e ce ne sono 146.

Ma ce ne sono **204** per V3 contro **146** per V1, e sul conto finale V1 resta avanti di molto.

---

## Il quarto leak, e stavolta l'ho fatto io

La prima esecuzione di questo script dava a V1 il **69,2%**. Il leave-one-out **non c'era**: la serie
in esame è membro della sua bolla, quindi il suo contributo al centroide si regalava `1/n` di coseno —
e con 30 membri sono **+0,033** su una scala dove i coseni veri stanno fra 0,02 e 0,2. Bastava a
ribaltare l'argmax, e l'ho scritto solo perché **stavo guardando**:

```
V1 (pesi grezzi)     propria bolla   415 (69,2%)     <- senza LOO
V1 (pesi grezzi)     propria bolla   378 (63,0%)     <- col LOO esatto
```

**È il quarto leak della sessione**: 63,7% → 35,3%, 58,27% → 0,33%, 55,8% → 33,2%, e questo. Il primo
l'ho trovato rifacendo la misura per un'altra via, il terzo applicando un contratto, e **questo
avrebbe dovuto fermarlo il contratto `assert_loo_esatto` del ticket 01** — che esiste, è testato,
ferma 4 casi su 4, e **non l'ho chiamato**. Averlo scritto non basta: va chiamato.

---

## Cosa significa per il collocatore

La scelta di V3 era nata dall'obiezione su *Verity*: i suoi **vicini** erano *Cinquanta sfumature di
grigio* e *WeCrashed* invece di thriller, e con V3 diventavano *Le Grand Jeu*, *El páramo*, *Il
silenzio della palude*. Quella misura è **ancora valida** e vale per il livello **micro** — i titoli
da mostrare.

Ma la bolla è un'altra domanda, e lì V3 **dimezza** la precisione. Quindi:

| livello | cosa | pesatura |
|---|---|---|
| **macro** — la bolla, per navigare il grafo | 63,0% con V1 · 35,3% con V3 | **V1** |
| **micro** — i 10 titoli più vicini, da mostrare | V3 legge thriller, V1 legge *Cinquanta sfumature* | **V3** |

**Due livelli, due pesature diverse**, e non è un compromesso: sono due domande con due risposte
misurate. È la forma finale del collocatore, e sostituisce quella scritta nel ticket 04 di
`mappa-pesata` (che usava V3 per tutto).

**E il numero della collocazione delle serie va corretto**: il **35,3%** che ho riportato in ogni
report di questa sessione era misurato con V3. Con V1, sulle stesse 336 bolle candidate e con lo
stesso leave-one-out, è **63,0%**. Il numero vero della collocazione a freddo delle serie è quasi il
doppio di quello che ho scritto per ore.
