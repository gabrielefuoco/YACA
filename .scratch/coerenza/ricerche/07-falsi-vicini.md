# Ticket 07 — I falsi vicini sulla mappa

`Status: resolved` · 14/10/2026 · `07-falsi-vicini.py` e `07b-esemplari.py`

**La correzione di §5.4 funziona nella prima metà e non nella seconda.** La divisione per
`√(|a|·|b|)` fa esattamente quello che deve: i falsi giganti cadono. Il `cos(μ_a, μ_b)` invece
**non discrimina**, e in un caso **peggiora**: fra i centroidi V3 il coseno è positivo nel **99,7%**
delle coppie, e sulla bolla del seinen anime mette *Miss Bala* **al primo posto** con 0,755, mentre i
vicini veri stanno a 0,65-0,70.

La coerenza va misurata **fra esemplari, non fra centroidi**: `max_{i∈a, j∈b} cos(v_i, v_j)`. Con
quella, *Miss Bala* precipita a **0,130** mentre i vicini veri stanno a 0,50-0,61, e il talk show
recupera *Letterman* e *Jeopardy!*.

---

## La divisione per taglia: funziona

| bolla | prima | dopo |
|---|---|---|
| 525 seinen anime | **18 (155 tit.) a 79,7** — *Miss Bala* | 622, **1078 (Blood+/Berserk)**, 555, 959 |
| 560 talk show | **176 (101 tit.) a 73,3** — *Wet Hot American Summer* | 176 a 0,18, **678 (Tagesschau)**, **364 (Jeopardy!, QI)** |
| 12 true crime | **588 (34 tit.) a 294,7** — *Flintstones* | 588 a 2,99, 175, 697 |

Una bolla da 150 titoli ha cinque volte il volume di fuoco di una da 30: normalizzando, i falsi giganti
scendono di tre ordini di grandezza. **Questo pezzo del §5.4 è giusto.**

## Il coseno fra centroidi: misurato, non discrimina

```
coseni fra i centroidi V3: mediana 0,086 · positivi 99,7% · sopra 0,1 il 43,7%
```

**Quasi tutte le coppie di bolle hanno un coseno positivo.** La ragione è la stessa del ticket 06: un
centroide è la media di migliaia di token, quindi è denso e piatto, e due medie si somigliano sempre un
po'. Il senior scrive che «i loro centroidi V3 hanno coseno prossimo a zero»: **misurato, non è vero.**

E non è solo debole — su un caso **sbaglia**:

| vicino della bolla 525 | cos(μ_a, μ_b) | coerenza per esemplari |
|---|---|---|
| b18 — ***Miss Bala*, *Il postino*** | **0,755** ← il massimo | **0,130** ← il minimo |
| b622 — *Demon Slayer*, *Jujutsu Kaisen* | 0,675 | **0,607** |
| b555 — *Monster*, *Death Note* | 0,693 | 0,510 |
| b1078 — *Blood+*, *Berserk* | 0,658 | 0,501 |

Il coseno fra le due medie dice che il seinen anime somiglia al cinema italiano di serie B **più** che a
*Monster*. Gli esemplari dicono l'opposto, ed è la verità.

## La coerenza per esemplari

`coerenza(a, b) = max_{i∈a, j∈b} cos(v_i, v_j)` sui 25 membri più internamente connessi di ogni bolla
(`quanti=25` non è innocente: prendere tutti i membri di una bolla da 150 rende l'operazione 150 volte
più lenta e trova sempre un picco per caso — una bolla grande contiene di tutto).

| bolla 525 | peso grezzo | /√(\|a\|\|b\|) | coerenza esempl. |
|---|---|---|---|
| b622 Demon Slayer | 119,4 | 2,240 | **0,607** |
| b959 86 Eighty Six | 55,9 | 1,364 | 0,588 |
| b555 Monster · Death Note | 111,5 | 1,703 | 0,510 |
| b1078 Blood+ · Berserk | 76,9 | 2,204 | 0,501 |
| **b18 Miss Bala** | 79,7 | 0,840 | **0,130** |

| bolla 560 | peso grezzo | /√(\|a\|\|b\|) | coerenza esempl. |
|---|---|---|---|
| b540 **Late Show with David Letterman** | 33,1 | 0,620 | **0,715** |
| b364 **Jeopardy! · QI** | 29,6 | 0,486 | 0,401 |
| b176 Wet Hot American Summer | 73,3 | 0,905 | 0,434 |
| b21 Papà · La parola ai giurati | 39,4 | 0,416 | 0,101 |
| b154 Un giorno come tanti | 35,6 | 0,476 | 0,067 |

**Due casi su tre si separano nettamente.** Il terzo no:

| bolla 12 (true crime) | coerenza esempl. |
|---|---|
| **b588 — *Concerto di Natale con i Flintstones*** | **0,620** ← primo |
| b175 Amiche per sempre | 0,400 |
| b350 La guerra dei Roses | 0,106 |

I *Flintstones* restano primi anche per esemplari: **0,62 di coseno massimo** è un picco vero, e la
causa è la stessa di *Verity* con *Cinquanta sfumature* — un token condiviso che non è tematico. Il
candidato più probabile è il **cast** (i doppiatori italiani di un film di Natale e di un documentario
sul crimine possono coincidere) o la **casa di produzione**.

**Conseguenza:** la coerenza per esemplari è la misura giusta, ma **eredita le debolezze dei pesi V3**,
che è esattamente ciò che il ticket 05 di `mappa-pesata` aveva trovato. La forma finale sarà quella
misura **coi soli token tematici** (`kw:` e `ge:`), escludendo cast, case e registi: il ticket 09 la
adotta, e questa è la ragione per cui serve.

## La mappa

| costruzione | archi | grado mediano | componenti | ginocchio w6/w7 |
|---|---|---|---|---|
| adiacenza binaria | 1.249.858 | 798 | 1 | 1,074 |
| **top-k pesato** (ticket 02) | 13.000 | 10 | **1** | **1,24** |
| **top-k coerente** (qui) | 13.000 | 10 | **1** | 1,16 |

La mappa col peso coerente **resta navigabile** (una sola componente a ogni k) ma ha un ginocchio
**peggiore** (1,16 contro 1,24): la coerenza fra esemplari riordina i vicini in modo semanticamente
migliore ma **strutturalmente meno netto**. Quindi:

- per **mostrare** i vicini di una bolla, la mappa coerente (il criterio del senior, nella forma giusta);
- per **navigare** con un taglio che seleziona davvero, il top-k pesato del ticket 02.

Le due mappe servono due cose diverse, come i due livelli del collocatore. Adottarne una sola
significherebbe perdere una delle due proprietà, ed è la stessa lezione di *Verity* applicata alla
mappa.

Salvata in `mappa-coerente.npz` (top-8 coerente, coi coseni fra centroidi per riferimento).
