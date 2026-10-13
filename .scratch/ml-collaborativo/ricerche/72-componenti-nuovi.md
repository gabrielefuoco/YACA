# 72 — I componenti nuovi: il verdetto sulle bolle

**Il mandato**: usare più dati possibile, normalizzando se sbilanciati. Il co-watch (la frequenza di visione insieme) e il grafo semantico delle keyword.

**L'esito**: **i componenti nuovi funzionano, e il grafo delle keyword è il singolo guadagno più grosso della sessione sulle bolle.** Le bolle passano da ~12/24 buone a ~16-18/24, e quelle nuove sono *più profonde* — i fratelli Dardenne, Adam Curtis, Uwe Boll, il cinema turco, il cinema saggistico di Godard.

**E raffina il report 71**: non è "aggiungere peggiora" — è **quali** componenti aggiungi. `Kc` e la curatela peggiorano; `KW`, `TV`, `CAST`, `DIR`, `COLL` migliorano.

Script: `componenti-nuovi.py` · `bolle-2.py`.

---

## 1. I cinque componenti nuovi

Tutti costruiti con pesi **IDF** (un metadato comune come "drama" non conta quanto uno raro come "mind control") e normalizzati per riga prima del mixing.

| componente | da dove | archi | titoli coperti |
|---|---|---|---|
| **KW** — grafo semantico | `keywords` TMDB (439.225 valori su 34.013 keyword) | 3.101.636 | **65.969 / 66.259 — il 99,6%** |
| **CAST** — attori condivisi | `cast`, primi 10 accreditati | 2.127.292 | 63.238 (95%) |
| **TV** — visione insieme | le cronologie Trakt (393 utenti, 305.893 voci) via SVD | 1.767.492 | **35.215 (53%)** |
| **DIR** — registi e autori | `directors` + `created_by` | 416.230 | 46.373 (70%) |
| **COLL** — franchise | `collection_id` (3.374 collezioni) | 20.544 | 5.836 (9%) |

**I due che contano più di tutti:**
- **KW copre il 99,6% del catalogo**, coda compresa — è il componente che può dare struttura dove il comportamento non c'è.
- **TV copre 35.215 titoli, e sono le serie e la coda dei film** — cioè esattamente dove `CF` (49.041 film, zero serie) è cieco. È il dato che stavamo buttando.

## 2. Il verdetto: leggendo 24 bolle per variante

| variante | bolle buone su 24 | cosa ho visto |
|---|---|---|
| A) comportamento (base) | ~12 | horror di Natale, musical camp, Tarzan, reality di sopravvivenza |
| **B) + keyword** | **~16** | **western, Olocausto, vampiri, anime fantasy, found footage, cinema saggistico, reality** |
| D) + keyword + Trakt | **~16-18** | **horror contemporaneo, supereroi gotici, noir, cinema coreano, cinema queer d'autore** |
| E) + keyword + Trakt + cast + registi + franchise | ~15-17 | **i Dardenne, Adam Curtis, Uwe Boll, cinema turco, teen series, Disney classico** |

### Le bolle che prima non esistevano

**Con le keyword (B):**
- **western**: Il piccolo grande uomo · Un uomo chiamato cavallo · Nevada Smith · Giorni di fuoco · L'uomo dal lungo fucile
- **Olocausto**: Bastardi senza gloria · Jojo Rabbit · Il bambino con il pigiama a righe · Operazione Valchiria · Black Book · Suite francese
- **vampiri**: Day Shift · Ammazzavampiri · Castlevania · Stake Land · Fright Night 2 · Modern Vampires
- **anime fantasy**: Tower of God · Witch Hat Atelier · Spice and Wolf · Rokka no Yuusha · Kino no Tabi
- **cinema saggistico**: F come Falso · Le Livre d'image · Histoire(s) du cinéma · Ici et Ailleurs · Nadja à Paris
- **found footage**: Hangman · Archivo 253 · Toad Road · Delivery: The Beast Within · The Black Water Vampire
- **reality**: La febbre dell'oro · Storage Wars Canada · Duck Dynasty · Moonshiners · Highway Thru Hell

**Con le keyword e il Trakt (D):**
- **horror contemporaneo**: Black Phone · Nope · M3GAN · Smile · Talk to Me · Barbarian · Pearl
- **supereroi gotici**: Constantine · Hellboy · Blade · Underworld · Ghost Rider · Dracula Untold
- **noir classico**: Sgomento · Il romanzo di Thelma Jordon · Blonde Ice · Quicksand · Labbra avvelenate
- **cinema coreano storico**: My Way · The Battleship Island · Assassination · Mr. Sunshine · The Last Princess
- **cinema queer d'autore**: Morte a Venezia · Mishima · Querelle · Caravaggio · The Watermelon Woman

**Con tutto (E):**
- **i fratelli Dardenne e la loro scuola**: Due giorni una notte · Rosetta · L'enfant · La Promessa · Il figlio · Tori e Lokita
- **Adam Curtis**: HyperNormalisation · The Century of the Self · Bitter Lake · The Power of Nightmares
- **Uwe Boll**: In the Name of the King · Alone in the Dark · BloodRayne · House of the Dead · Postal
- **cinema turco**: Muhteşem Yüzyıl · Behzat Ç. · Takva · Payitaht: Abdülhamid · Times and Winds
- **teen series**: Ginny & Georgia · Heartstopper · SKAM · XO Kitty · Do Revenge

**Queste non sono "generi": sono autori, scuole, nicchie, franchise.** Un umano le riconosce e sa cosa sta guardando.

## 3. La lezione che raffina il report 71

Il report 71 concludeva «**aggiungere tutto peggiora**». **Era vero per quei componenti, non in generale.** La differenza:

| componente aggiunto | effetto sulle bolle |
|---|---|
| `Kc` (metadati SVD) | **peggiora** — dice "Drama" di tutto e impasta |
| la curatela | **peggiora** |
| **`KW` (keyword)** | **migliora molto** |
| **`TV` (visione insieme)** | **migliora** |
| `CAST`, `DIR`, `COLL` | migliorano o neutri |

**E c'è una conferma forte di una cosa già vista**: la modularità **scende** da 0,205 (A) a **0,057** (E) mentre la qualità **sale**. **La modularità non è qualità**, ed è la seconda volta che lo misuro.

## 4. Il limite

**24 bolle per variante su ~1.000-5.000.** È un campione dell'1-2%, e il verdetto è mio (il criterio è quello del report 71: *il filo comune si deve poter nominare*). La direzione è solida e le bolle che ho citato esistono; i numeri esatti ("~16 su 24") sono indicativi.

**E una cosa che non ho fatto**: **l'ablation dei componenti nuovi**. So che l'insieme migliora, non so **quanto pesa ciascuno**. `COLL` copre solo il 9% e `DIR` il 70% con una mediana di 2 vicini: potrebbero essere zavorra come `Kc`.

## 5. Cosa farei adesso

1. **Ablation dei componenti nuovi**: toglierne uno per volta e leggere le bolle. È l'unico modo di sapere cosa si guadagna il posto — ed è la stessa disciplina che ha tolto `Kc`, i temi e la curatela.
2. **Trovare i pesi**: ora sono tutti a 1. `KW` copre il 99,6% e `COLL` il 9% — non è detto che debbano pesare uguale. E va tarato **leggendo**, non con una metrica.
3. **Rifare le bolle definitive** con la ricetta che vince, e **poi** la navigazione (bolle vicine + scelta popolare/nicchia dentro la bolla).
4. **Il recupero non è stato ritoccato**: i componenti nuovi sono entrati nel grafo delle **bolle**. Se `KW` e `TV` aiutano a raggruppare, potrebbero aiutare anche a recuperare — e il report 68 dice che sul lato serie c'è bisogno di tutto.
