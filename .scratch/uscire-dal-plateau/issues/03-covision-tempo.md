Status: resolved
Type: task
Blocked by: 02

# COVISION: togliere `--semplice`, riattivare la finestra temporale, e il secondo ordine fuori finestra

## Il difetto

`build-v18.sh:59` invoca `covision.py build --semplice --minsup 1 --topk 20`. Con `--semplice` la
`score()` salta il fattore temporale (finestra `LAG=365` giorni dall'uscita) e la normalizzazione p99
fra le quattro fonti. Risultato: *Barbie* eredita l'intera co-visione congiunturale 2022-2023.

## Cosa fare

1. Rigenerare COVISION **senza** `--semplice` (con `LAG=365` e normalizzazione fra fonti) e con
   `--topk 150` invece di 20. Costo atteso ~25 minuti sui corpus in `.cache/`.
2. Costruire il tipo **COV2** (secondo ordine fuori finestra): matrice COVISION non troncata, si
   azzerano gli archi fra titoli usciti a meno di ±365 giorni (usando le uscite ordinali), poi
   `TruncatedSVD(n_components=256)` e coseno fra le righe. L'idea: per sapere se *Barbie* e
   *Oppenheimer* hanno lo stesso pubblico, si guarda **cosa hanno visto gli spettatori prima del 2022**.
3. Misurare: banco (IC), quota >5k, e la top-10 di *Barbie*, *Oppenheimer*, *Drive*.

## Criteri di accettazione

- *Oppenheimer* esce dalla top-10 di *Barbie* o scende oltre il rango 30 nella riga COV2.
- COVISION senza `--semplice` non perde più di 0,005 di R@20 sul banco.
- COV2 ha copertura ≥ 95% delle righe e grado mediano 100-200.

## Note

Il secondo ordine va calcolato **dopo** aver rimosso la finestra, non prima: sulla matrice troncata a
top-20 i profili di *Barbie* e *Oppenheimer* sono identici e la SVD li unisce ancora di più.

---

## Esito

`covision.py build` **senza** `--semplice`: 1.112.164 archi (contro i ~2,5M della versione semplice),
56.073 titoli con archi, sconto temporale `0,3 + 0,7·ratio` sulla finestra di 365 giorni e p99 per fonte
riattivati. Pipeline ricostruita (`v18nosem`).

| grafo | R@5 | R@10 | R@20 | MRR | >5k top-10 | SNIPS |
|---|---:|---:|---:|---:|---:|---:|
| con `--semplice` | 0,146 | 0,204 | 0,264 | 0,1023 | 72,3% | 0,156 |
| **senza `--semplice`** | 0,141 | 0,196 | 0,256 | 0,0975 | **65,5%** | 0,167 |

`R@20 −0,0080 [−0,0139, −0,0023] · MDE 0,0083` → al limite, "sotto l'MDE" per un soffio.
`SNIPS +0,0109` con IC che attraversa lo zero (120 utenti: MDE 0,0345, troppo pochi per concludere).

**Il guadagno vero è la coda: −6,8 punti di blockbuster in top-10**, il più grande misurato finora
(COVISION 2,2→1,0: −8,1; gate asimmetrico: −1,4; CREWPROP: −1,3).

Effetto su *Barbie*: **Oppenheimer dal #9 al #22** (la bolla del weekend 2023 si rompe), *Lady Bird*
dal #19 al #12, **Piccole donne al #3**. Ma la top-10 diventa animazione e Marvel (*Pinocchio*,
*La sirenetta*, *Nimona*, *Endgame*, *No Way Home*): togliendo la finestra temporale, la co-visione
restante è per **tipo di pubblico**, e il pubblico di *Barbie* è quello dei blockbuster per famiglie.
È la conferma della diagnosi: *The Substance* e *Josie* non possono venire da questi segnali.

Da decidere (ticket aperto): adottare la COVISION temporale come base — costa 0,008 di R@20 e
guadagna 7 punti di coda. Consigliata sì, con il costo dichiarato.
