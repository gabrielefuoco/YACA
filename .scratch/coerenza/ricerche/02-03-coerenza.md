# Ticket 02-03 — La frammentazione (N_eff) e le chimere (PMI)

`Status: resolved` · 14/10/2026 · `02-03-coerenza.py` (log in `log/02-03-coerenza.log`)

**Le due metriche di §1.B funzionano, e la prima corregge una previsione del senior.** Il `film noir`
non ha `N_eff ≈ 2,1`: ha **35,35**. E il `psychological thriller` non ha 18,5: ha **101,78**. La
ragione è strutturale e cambia il modo di usare la metrica.

---

## N_eff: cosa misura davvero

`N_eff(t) = 1 / Σ_b P(b|t)²` sui titoli che portano il tropo. Su 2.494 ancore (`kw:`/`ge:` con
`30 ≤ df ≤ 1500`).

| le più **coese** | titoli | N_eff | dove |
|---|---|---|---|
| `kw:super sentai` | 40 | **1,17** | b295 (37) |
| `kw:james bond` | 30 | **1,23** | b962 (27) |
| `kw:ultraman` | 31 | **1,41** | b69 (26) |
| `kw:gundam` | 41 | **1,97** | b782 (28) |
| `kw:donghua` | 87 | 2,22 | b173 (58) |
| `kw:marvel cinematic universe (mcu)` | 77 | 3,46 | b399 (32) · b1098 (22) |
| `kw:medical drama` | 132 | 4,28 | b272 (63) |

| le più **frantumate** | titoli | N_eff |
|---|---|---|
| `kw:revenge` | 1.487 | **418,70** |
| `kw:new york city` | 1.285 | 360,14 |
| `kw:love` | 1.079 | 354,20 |
| `kw:kidnapping` | 700 | 324,50 |
| `kw:biography` | 1.359 | 305,52 |
| `kw:police` | 1.124 | 257,52 |
| `kw:drugs` | 600 | 253,88 |

**Il pattern è netto: in cima ci sono FRANCHISE, in fondo MODI.** Super sentai, James Bond, Ultraman,
Gundam, l'MCU sono **unità commerciali** — dove il tag *è* il mondo, e il mondo è una bolla. `revenge`,
`love`, `police`, `new york city` non sono mondi: sono **modificatori** che tagliano il catalogo in
lungo e in largo per costruzione.

Quindi `N_eff` non misura «quanto è coeso il mondo X»: misura **quanto un tag coincide con un mondo**.
Le due cose coincidono solo per i tag che sono già dei mondi.

### La previsione del senior, verificata

| tropo | previsto | **misurato** |
|---|---|---|
| `kw:film noir` | ≈ 2,1 | **35,35** |
| `kw:psychological thriller` | ≈ 18,5 | **101,78** |
| `kw:spaghetti western` | — | 11,39 |
| `kw:iyashikei` | — | **7,81** |
| `kw:true crime` | — | 8,32 |
| `kw:cyberpunk` | — | 44,32 |
| `kw:superhero` | — | 46,33 |
| `kw:slasher` | — | 88,07 |

Le previsioni sbagliano di un ordine di grandezza, ma **la direzione è giusta** (il noir sta meglio
del thriller psicologico: 35 contro 102). La causa della differenza: il noir è un **genere storicamente
situato** — 544 titoli dagli anni '40 agli anni '90, su tre continenti — e la partizione lo spezza per
**decennio e per paese**, che è esattamente ciò che deve fare con dei modificatori.

**La banda utile è un'altra**: `N_eff` fra **5 e 25**. Lì c'è un mondo che esiste ma è imperfetto, ed è
lì che si ripara: **`kw:iyashikei` 7,81** (la nicchia che il ticket 02 di `todo-grafo` ha visto
sciogliersi), **`kw:true crime` 8,32**, **`kw:spaghetti western` 11,39** (la bolla-chimera 594). Sopra
25 non c'è niente da riparare: non c'era un mondo.

---

## L'indice di chimera: funziona, ma serviva un filtro

La PMI fra i 5 token tematici di testa di ogni bolla. **La prima esecuzione era inutilizzabile**: le
prime quindici "chimere" erano tutte bolle da 5-31 titoli con PMI `-inf`, cioè le **migliori** — perché
in una bolla piccola i 5 token di testa sono rari, non co-occorrono mai per caso, e `-inf` arriva per
ragioni banali. Il difetto era mio, non dell'idea: **mancava un filtro di supporto** (`df ≥ 30`, la
stessa soglia delle ancore).

Con il filtro, 1.261 bolle giudicabili. Le più chimeriche:

| bolla | titoli | PMI mediana | i 5 token di testa |
|---|---|---|---|
| 136 | 92 | **−3,30** | `ge:documentary` · `ge:action` · `ge:thriller` |
| 924 | 30 | −3,30 | `ge:documentary` · `ge:action` · `ge:thriller` |
| 89 | 110 | −2,81 | `ge:science fiction` · `ge:documentary` · `ge:sci-fi & fantasy` |
| 604 | 43 | −2,81 | `ge:action` · `ge:reality` · `ge:documentary` · `ge:science fiction` |
| 100 | 100 | −2,20 | `ge:horror` · `ge:animation` · `ge:action & adventure` · `ge:thriller` · `ge:sci-fi & fantasy` |
| 133 | 87 | −2,14 | `kw:christian film` · `ge:romance` · `ge:reality` · `ge:drama` · `ge:documentary` |
| 77 | 117 | −2,08 | `ge:comedy` · `ge:documentary` · `ge:drama` |

E le più coerenti:

| bolla | titoli | PMI mediana | i 5 token |
|---|---|---|---|
| 1350 | 11 | +4,32 | `kw:horror spoof` · `kw:spoof` · `kw:parody` |
| 1334 | 16 | +4,33 | `kw:survival horror` · `kw:death game` · `kw:torture` · `kw:mind game` |
| 1413 | 8 | +4,48 | `kw:evil spirit` · `kw:medium` · `kw:supernatural horror` |

**Il verdetto è doppio e va detto.**

1. **L'indice funziona, e conferma il §5.2 del senior**: le chimere sono **tutte bolle grandi**
   (30-117 titoli) con **generi incompatibili** — `documentary + action + thriller` è un controsenso
   come mondo, non un mondo sbagliato. Sono le bolle-continente, individuate meccanicamente.
2. **Ma sulla bolla 594 non conferma il senior**: la sua "spaghetti western con dentro Zeder e Dabbe"
   non compare fra le chimere, perché i suoi token di testa (dopo il ripristino di `genres`) sono
   `kw:spaghetti western` con compagnia coerente. Il difetto della 594 **non è nei 5 token di testa**,
   è in **pochi membri fuori posto** su 132: un indice sui token di testa non può vederlo, e serve una
   misura **per membro** (quanto il singolo titolo è lontano dal centroide della sua bolla), che il
   ticket 09 deve aggiungere.

Le due metriche sono salvate in `coerenza-neff.npz` per essere riusate come arbitro nei ticket
successivi: **prima e dopo ogni intervento**, per vedere quale mondo si ricuce e quale no.
