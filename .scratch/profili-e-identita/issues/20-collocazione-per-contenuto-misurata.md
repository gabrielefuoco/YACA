Status: ready-for-agent
Type: research
Blocked by: —

# Collocare un titolo nuovo per solo contenuto: quanto somiglia a una riga servita?

## La domanda

Un titolo fuori canone non ha comportamento. Ha contenuto: trama, keyword, cast, regia, collezione,
paese, decennio. La fusione V45 pesa le fonti così (`v45/pesi.json`, totale **8,4**; RRF `k=15`):

| fonte | peso | calcolabile per un titolo nuovo? |
|---|---|---|
| `KWSEM` | 1,4 | ✅ keyword semantiche |
| `RESID` | 1,2 | ✅ |
| `DIR` | 1,0 | ✅ regia |
| `COVISION` | 0,8 | ❌ nessuno l'ha ancora guardato |
| `COLL` | 0,5 | ✅ collezione/franchise (TMDB) |
| `CAST` | 0,4 | ✅ |
| `PROD` | 0,3 | ✅ |
| `CONTESTI` | 0,2 | ✅ |
| `CREWPROP` | 0,15 | ✅ |
| `TRIBU` | 0,15 | ✅ |
| `TRAMA` | 0,15 | ✅ embedding di trama |
| `LISTSEM` | 0,15 | ✅ |
| `RRFST` | 1,0 | ❌ studente (artefatto perso) |
| `LIST` | 1,0 | ~ liste curate: un titolo nuovissimo può non essere in nessuna |

**5,6 su 8,4 (67%) calcolabile dal contenuto. 2,8 su 8,4 è comportamento.**

La domanda del ticket: le righe costruite **senza** quel 33% stanno nello stesso quartiere delle
righe servite? Non lo sappiamo, e non serve discuterne: si misura.

## L'esperimento

Nessuna GPU, nessun addestramento, nessun artefatto nuovo. Si usano i titoli **già nel canone** come
prova: hanno una riga servita *e* tutto il contenuto necessario per ricostruirla.

1. **Campione.** ~300 titoli dal canone, stratificati: film / serie / anime, popolari e di coda.
   Solo con trama e keyword presenti.
2. **Riga per solo contenuto.** Per ciascuno, ricomporre la riga usando le sole fonti `✅` con i loro
   pesi veri, e RRF `k=15` — cioè ciò che si potrebbe calcolare per un titolo appena uscito.
3. **Confronto.** Sovrapposizione fra i top-100 così ottenuti e i top-100 **serviti**
   (`vicini-top100.npz`): `overlap@10`, `@50`, `@100`. Distribuzione, non media: conta la coda.
4. **La prova che conta davvero.** Un profilo i cui semi sono collocati *per contenuto* produce
   scaffali simili a quelli che produrrebbe con le righe servite? Misurare la sovrapposizione dei
   titoli nei primi tre scaffali, per 10 profili sintetici.

## Le soglie, dichiarate PRIMA di misurare

Altrimenti il numero si legge a comodo.

| esito | lettura | conseguenza |
|---|---|---|
| `overlap@100` mediano **≥ 0,5** | il contenuto colloca nel quartiere giusto | si procede con 21 |
| **0,2 – 0,5** | colloca in un quartiere *plausibile ma diverso* | si procede, ma il 22 deve rendere reversibile l'incremento |
| **< 0,2** | due spazi diversi che si chiamano allo stesso modo | ci si ferma: o si riaddestra lo studente (23), o non si colloca |

Secondaria, ma va registrata: la coda. Se il mediano è buono e il 10° percentile è zero, il
problema non è risolto, è solo medio.

## Fuori scope

Scrivere la pipeline (21), toccare gli artefatti serviti, decidere la cadenza. Qui si **misura** e si
scrive l'esito, con i numeri e i grafici che servono a decidere.
