"""Assembla report.md dai numeri gia' prodotti (CSV) e dal testo dell'analisi."""
import csv
from pathlib import Path

HERE = Path(__file__).resolve().parent
righe = list(csv.DictReader(open(HERE / "vicini-spiderman-100.csv", encoding="utf-8")))

def tabella_top100():
    out = ["| # | peso | % del max | bolla (n) | titolo | voti | voto | bayes |",
           "|---:|---:|---:|---|---|---:|---:|---:|"]
    for r in righe:
        out.append(
            f"| {r['rango']} | {float(r['peso']):.4f} | {float(r['quota_del_max_%']):.3f}% | "
            f"b{r['bolla']} ({r['bolla_n']}) | {r['titolo']} ({r['anno']}) | "
            f"{r['voti']} | {r['voto']} | {r['bayes']} |")
    return "\n".join(out)

testo = """# Pulizia delle bolle e vicinato di Spider-Man — le misure

**Data**: 21/10/2026 · **Artefatti**: `services/graph/data/` (partizione V10 `bolle-eterogeneo-subvoti`,
triangolo `bolle-eterogeneo-V10-p1.0-triangolo.npz`, `bolle.json`, `metadati-canone.npz`).
**Canone**: 66.259 titoli = 49.709 film + 16.550 serie · 3.497 bolle (mediana 11 membri).

---

## 1. I 100 vicini di Spider-Man (2002)

### Che cosa vuol dire "vicino"

Il grafo dei suggerimenti è la miscela simmetrica dei dieci componenti (CF, keyword, cast, regia,
collezioni, trama, Trakt-liste…): ogni arco ha un **peso**, e la camminata lo normalizza per riga.
Per un **seme singolo** l'ordine per peso è identico a quello della riga di transizione — la
normalizzazione è una costante — quindi "i 100 più vicini" = i 100 archi di peso maggiore.

Due precisazioni:

- il grafo **potato** che usa la camminata tiene solo il top-16 per riga (più gli archi inversi):
  da Spider-Man escono **28** archi, non 100. Per arrivare a 100 bisogna leggere il triangolo pieno
  (390 archi da quel nodo, 13,25 M nel grafo intero);
- il peso non è un coseno in [0,1]: è la somma dei componenti, e vale 259,9 per *Spider-Man 2*.
  Conta solo **relativamente**, dentro la riga.

Nodo: **`movie:557` — Spider-Man (2002, Sam Raimi)**, riga 50, bolla **2474** (5 membri: i cinque
film live-action di Spider-Man, compreso lui).

### Il numero che conta

| taglio | bolle distinte | bolle con ≥2 membri | quota di peso della riga | ultimo peso | % del massimo |
|---:|---:|---:|---:|---:|---:|
| 4 | **1** | 1 | 77,5% | 24,8739 | 9,571% |
| 8 | 4 | 2 | 84,3% | 5,0792 | 1,954% |
| 16 | 7 | 5 | 88,8% | 2,8542 | 1,098% |
| **20** | **8** | 5 | 90,3% | 2,5254 | 0,972% |
| **50** | **20** | 10 | **96,7%** | 0,6646 | **0,256%** |
| **100** | **53** | 18 | **99,1%** | 0,1573 | **0,061%** |

**Risposta**: i **50** più vicini stanno in **20 bolle**; i **100** in **53 bolle**. Ma il numero
racconta soprattutto che il vicinato è **piccolo e gerarchico**: i primi 4 (tutti nella bolla di
Spider-Man) valgono il 77,5% del peso, i primi 16 l'88,8%, e l'ultimo dei 100 vale lo **0,06%** del
primo. Oltre il rango ~40 la lista smette di essere un quartiere e diventa il rumore dei hub di
co-visione: *Peter Pan*, *Shrek*, *Pirati dei Caraibi*.

### Il vicinato, letto

| bolla | nel top 100 | che mondo è | voti mediani |
|---|---:|---|---:|
| **1634** | 10 | Marvel pre-MCU "scuro": Daredevil, Punisher, Ghost Rider, Elektra, Spawn | 2.760 |
| **1825** | 9 | X-Men della Fox (2000-2017) | 11.585 |
| **3161** | 6 | Spider-Man animato (Spectacular, Ultimate, 2017, 2025) | 396 |
| **2474** | 4 | Spider-Man live-action (Raimi + Webb) | 16.995 |
| **2187** | 4 | Fantastici 4 / Hulk (2003-2015) | 6.551 |
| **2527** | 4 | Spider-Man MCU + animazione Sony | 17.823 |
| **1474** | 4 | famiglia/avventura Spielberg (Hook, Peter Pan, Tintin) | 2.594 |
| **2649** | 3 | Blade | 5.426 |
| **1244** | 3 | Spider-Man TV anni '60-'80 | 86 |
| 44 altre | 1-2 | ognuna | — |

Le prime **9 bolle** coprono **47 dei 100**; le altre **44 bolle** si spartiscono i restanti 53.
Il "mondo Spider-Man" non è una bolla sola: è un **arcipelago di 5-7 bolle** (Raimi/Webb, MCU,
animazione, serie TV, X-Men, Fantastici 4) tenuto insieme dal pubblico, non dalla tassonomia.

### I 100, in fila

%%TABELLA%%

---

## 2. Pulire le bolle con la coda bassa del punteggio

### 2.1 La proposta letterale

Per ogni bolla (almeno 5 membri) si prende il **voto bayesiano** già in uso
(`canon.voto_bayesiano`: `m=300`, `C=6.5`, cioè `(voti·voto + 300·6.5)/(voti+300)`), la sua media e
la sua deviazione standard, e si eliminano i membri sotto `media − k·σ`. Solo la coda **negativa**.

| k | titoli persi | % del canone | film | serie | bolle toccate |
|---:|---:|---:|---:|---:|---:|
| 1,0 | 7.600 | 11,47% | 6.576 | 1.024 | 2.566 |
| 1,5 | 3.309 | 4,99% | 3.098 | 211 | 1.684 |
| 2,0 | 1.478 | 2,23% | 1.418 | 60 | 965 |
| **2,5** | **715** | **1,08%** | **694** | **21** | **543** |
| 3,0 | 346 | 0,52% | 336 | 10 | 297 |

**La risposta secca**: con la regola come l'hai scritta, a **2,5σ** perdi **715 titoli (694 film,
l'1,4% dei film)**; a 2σ ne perdi 1.478 (1.418 film). A 1σ ne perdi 7.600 — ma 1σ non è "troppo":
è la deviazione **tipica**, e infatti taglia l'11,5%.

### 2.2 Perché il bayesiano `m=300` non è il punteggio giusto per questo

Il bayesiano è fatto per **ordinare**, non per **misurare uno scarto**. Con `m=300` e un canone in cui
il `vote_count` mediano è **51**, tre titoli su quattro vengono tirati verso 6,5:

- il **76,2%** del canone sta entro ±0,25 dal 6,5; σ = 0,332, MAD = 0,136 (il voto grezzo ha σ = 1,064);
- un film da **2,0** con 42 voti vale **5,95**; uno da 1,8 con 10 voti vale **6,35**; uno da 4,5 con
  500 voti vale **5,25**.

Quindi la regola non premia "il film brutto", premia **il film brutto che ha abbastanza voti per
essere misurato**. I 715 rimossi a 2,5σ hanno `vote_count` mediano **149** (contro 51 del canone),
`vote_average` mediano **4,76**, e solo 9 stanno sopra 6. Va benissimo se la "schifezza" che vedi è
quella nota; dei 32.555 titoli sotto i 50 voti (metà del canone) ne tocca solo **104** (0,3%).

C'è anche un difetto strutturale: la σ della bolla **cresce** proprio nelle bolle eterogenee (i
"contenitori"), e una σ grande **protegge** gli intrusi. Misurato: nell'ultimo decile di σ la regola
rimuove lo 0,47% dei titoli, nei decili centrali l'1,2-1,4%. Le 238 bolle con mediana grezza sotto
5,5 (5.423 titoli) perdono solo **104** titoli (1,9%): le bolle interamente brutte restano intatte,
perché lì nessuno è "sotto la media".

### 2.3 Il limite matematico dello z (e perché le bolle piccole si salvano da sole)

Per n osservazioni il massimo scarto standardizzato possibile è `(n−1)/√n`. Quindi:

| n | z massimo possibile |
|---:|---:|
| 4 | 1,50 |
| 5 | 1,79 |
| 6 | 2,04 |
| 8 | 2,47 |
| 9 | 2,67 |
| 11 | 3,02 |

**Con meno di 9 membri, "2,5σ" è letteralmente impossibile**; con meno di 6 è impossibile anche
"2σ". È il motivo per cui la soglia `n≥5` non cambia quasi nulla (715 sia con `n≥5` sia con `n≥8`):
la taglia fa già da guardiano. Il rovescio: quelle bolle non vengono mai pulite.

### 2.4 La regola che consiglio

Due filtri indipendenti, perché fanno due mestieri diversi:

1. **Pavimento assoluto** — `vote_count ≥ 50` e `vote_average < 5,0`: è la schifezza **nota**,
   indipendente dalla bolla. **1.671 titoli** (2,52%): 1.643 film, 28 serie, 693 bolle. Solo 257
   stanno in bolle con mediana sotto 5,0: è un filtro sui **singoli film**, non sulle bolle intere
   (quelle si affrontano in §2.5).
2. **Intruso relativo** — la tua idea, ma sul bayesiano `m=300`, a **2,5σ**, solo bolle con ≥5 membri:
   **715 titoli** (694 film). Insieme al pavimento: **2.057 titoli (3,10%)**, di cui **2.017 film**
   (4,1% dei film) e 40 serie; 902 bolle toccate, 9 soli titoli sopra 6, 6 bolle svuotate, 28 bolle
   che scendono sotto i 5 membri.

| variante | titoli | film | serie | bolle | sopra 6 |
|---|---:|---:|---:|---:|---:|
| solo relativo 2,5σ | 715 | 694 | 21 | 543 | 9 |
| solo pavimento | 1.671 | 1.643 | 28 | 693 | 0 |
| **unione (consigliata)** | **2.057** | **2.017** | **40** | **902** | **9** |
| unione a 2σ | 2.613 | 2.541 | 72 | 1.171 | 55 |

Se invece l'obiettivo è la **coerenza** della bolla e non solo la qualità (togliere anche un 6,2 da
una bolla che vive a 8,0), lo stesso z va fatto sul **voto grezzo**, con mediana/MAD robusti e un
distacco minimo di 1,0 punto: **1.721 titoli** (1.278 film, 443 serie); unito al pavimento fa
**3.141 titoli (4,74%)** — 2.681 film, 460 serie, 1.396 bolle, 118 sopra 6, 106 bolle che perdono
almeno un quarto dei membri. È più aggressivo e tocca le serie molto più del bayesiano.

### 2.5 L'altra strada: togliere le bolle intere

Se il problema sono i "mondi" di schifezza, il filtro relativo è lo strumento sbagliato: quelli non
hanno intrusi, sono **tutti** intrusi. La misura, sulla mediana grezza della bolla:

| mediana `vote_average` | bolle | titoli |
|---|---:|---:|
| < 4,5 | 18 | 356 |
| < 5,0 | 69 | 1.430 |
| < 5,5 | 238 | 5.423 |

Togliere le 69 bolle sotto 5,0 costa **1.430 titoli** — meno dell'unione dei due filtri, e agisce
proprio sui contenitori. È una decisione di prodotto diversa: non "pulisco le bolle", ma "quelle
bolle non le servo".

### 2.6 Cosa questo filtro NON risolve

- **Non pulisce il grafo.** Gli archi restano: la camminata passa ancora dai titoli rimossi, e la
  loro attivazione resta. Va messa una **maschera in uscita** (o rifatta la partizione coi centroidi
  sui membri puliti); togliere righe da `bolle.json` cambia le liste ma non il cammino.
- **Non è stabile fra partizioni.** Gli id delle bolle non lo sono (mappa §9): la lista di esclusione
  va tenuta per chiave `movie:id`/`tv:id`, versionata con l'impronta dell'artefatto.
- **Non è una misura di gusto.** È un filtro di qualità: un film cult da 4,0 sparisce insieme alla
  schifezza vera. Se serve distinguere, l'unico arbitro è l'occhio su un campione, non un'altra soglia.
- **Il numero dipende da k, non dai dati.** Uno z-cut rimuove sempre una quota fissata: 1σ ≈ 11-15%,
  2σ ≈ 2-3%, 2,5σ ≈ 1%. La soglia è una scelta di prodotto; la misura dice solo **quanto costa**.

---

## Riproduzione

```bash
cd .scratch/pulizia-bolle
../../offline_graph_builder/venv/Scripts/python.exe 01-vicini.py   # top 100 + CSV
../../offline_graph_builder/venv/Scripts/python.exe 02-pulizia.py  # soglie + CSV candidati
```

File: `vicini-spiderman-100.csv` (100 righe) · `candidati-pulizia.csv` (2.057 righe, la regola
consigliata: motivo `schifezza`/`coda bayes` e numeri della bolla) · `candidati-coerenza.csv`
(3.141 righe, la variante che toglie anche gli intrusi sul voto grezzo).
"""
testo = testo.replace("%%TABELLA%%", tabella_top100())
(HERE / "report.md").write_text(testo, encoding="utf-8")
print("scritto report.md", len(testo), "caratteri")
