# 01 — Sonda teacher/student: il piano regge? (campione, 08/10/2026)

**Mappa**: [../map.md](../map.md) · **Banco**: `probe-teacher-student.py`, `probe2-teacher.py` (campione: 3.000 film con ≥20 voti MovieLens, 32M voti, 200.948 utenti)

---

## A) Il teacher è informativo e diverso dalle keyword? **Sì, e molto**

Similarità collaborativa item-item dai co-voti, due normalizzazioni a confronto.

| | `cos` (cosine sui co-voti) | `npmi` (corretta per popolarità) |
|---|---|---|
| *Il padrino* → | Matrix (0.57), Fight Club (0.57), Blade Runner (0.51) | (resta sul canone maschile, ma più specifico) |
| *Fight Club* → | Matrix (0.70), Pulp Fiction (0.63), Inception (0.60) | Matrix (0.42), **Donnie Darko (0.40), Requiem for a Dream (0.38)**, Truman Show (0.34) |
| *Interstellar* → | Inception (0.68), Guardiani della Galassia (0.59) | Inception (0.58), Guardiani (0.55), **Lei (0.49)**, Blade Runner 2049 (0.47) |
| *Forrest Gump* → | Pulp Fiction (0.67), Matrix (0.61), Il re leone (0.58) | Speed (0.32), Pretty Woman (0.31), Ghost (0.29) |

**L'indipendenza dalle keyword è la notizia**: `Spearman(cos, keyword) = +0,104`, `Spearman(npmi, keyword) = +0,044`, sovrapposizione dei top-10 **0,3/10**. Sono due spazi quasi ortogonali: le keyword descrivono il *soggetto*, i co-voti descrivono il *pubblico*. Esattamente ciò che manca al nostro grafo.

**Ma `cos` è popolarità travestita**: i vicini di qualunque film famoso sono Matrix, Fight Club, Forrest Gump — perché sono i film che tutti hanno visto. `npmi` corregge: da *Fight Club* escono Requiem for a Dream, Donnie Darko, Truman Show (adiacenza culturale vera). `Spearman(cos, npmi) = 0,794`: stessa informazione di fondo, ma `npmi` toglie l'alone di fama.

## B) Lo student è imparabile dai metadati? **Sì, ma la feature dominante è la popolarità**

Predire «sono vicini nel teacher?» dalle sole feature di metadati (keyword pesate IDF, generi, distanza d'anno, distanza di voti, durata, lingua), split **per item** e non per coppia:

| modello | teacher `cos` | teacher `npmi` |
|---|---|---|
| solo keyword | 0,884 | 0,670 |
| **solo POPOLARITÀ** (controllo) | **0,933** | **0,772** |
| keyword + popolarità | 0,971 | 0,810 |
| TUTTO (10 feature) | 0,993 | **0,920** |

Lettura: **il piano è fattibile** (AUC 0,92 con il teacher buono), ma il modello impara soprattutto *quali film sono famosi* (0,772 da solo), non *quali film si somigliano*. Le keyword contribuiscono (0,670 da sole) e il resto delle feature porta il salto finale. Il rischio concreto: costruire un grafo che sa di popolare — esattamente il difetto che la campagna QC ha già trovato nei cataloghi hero ("popolari del momento travestiti da scelta personale").

## C) Il dato strutturale che riorienta il piano

| profilo reale | film in cronologia | serie in cronologia |
|---|---|---|
| tutti e 5 | **5** ciascuno | ~16 ciascuno |

MovieLens copre **0 serie**. Quindi:

- il teacher **non ha nulla da dire sulle serie**, che sono l'80% di ciò che i tuoi profili guardano;
- il valore per le serie dipende **interamente** dallo student (metadati → spazio collaborativo) — cioè da un assunto che questa sonda *non* ha ancora testato: che la lezione imparata sui film si trasferisca alle serie;
- e il segnale che lo student impara è, per ora, in prevalenza **popolarità**.

## Verdetto della sonda

| Assunto del piano | Esito |
|---|---|
| Il teacher porta informazione nuova rispetto alle keyword | ✅ **confermato** (Spearman 0,04; top-10 in comune 0,3/10) |
| Il teacher è «gusto» e non popolarità | ⚠️ **dipende dalla normalizzazione**: `cos` no, `npmi` sì (da usare `npmi`) |
| I metadati bastano a imparare la lezione collaborativa | ✅ fattibile (AUC 0,92 su item tenuti fuori) — ma ⚠️ dominata dalla popolarità (0,77 da sola) |
| Il valore si estende a serie e uscite recenti | ❓ **non testato**, ed è l'assunto su cui poggia tutto il valore (80% delle cronologie è serie) |

## Cosa farei adesso, in ordine di costo

1. **Canale collaborativo per i FILM** (economico, informazione nuova già disponibile): dai film visti, i vicini `npmi` diventano un'origine di candidati — misurarli sulle liste servite (nitidezza, distintività, e quanto sono *nuovi* rispetto ai cataloghi attuali). Se i vicini `npmi` non sono buoni suggerimenti, nessuno student li salverà.
2. **Solo dopo**, lo student (metadati → collaborative) — con il **controllo di popolarità** nel target e nella valutazione, e il cancello sul banco leave-out (deve aggiungere al grafo delle keyword, non solo correlare).
3. **Grafo k-NN + Leiden** confrontato con L1-L5: se i cluster escono uguali, non serve un grafo nuovo.

## Riproduzione

```bash
offline_graph_builder/venv/Scripts/python.exe .scratch/ml-collaborativo/probe2-teacher.py
node .scratch/ml-collaborativo/export-histories.js   # cronologie reali (solo film) per il test leave-out
```
