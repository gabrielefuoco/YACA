# 31 — La divisione di MovieLens: qualita' del dataset e i due mondi

**Data**: 08/10/2026 · `split-movielens.py` → `ratings-mainstream.parquet` · `ratings-nicchia.parquet`

## 1. Qualita' dei dati grezzi

| | |
|---|---|
| voti / utenti / film | 32.000.204 · 200.948 · 84.432 |
| voti per utente | 159 (mediana 72) |
| periodo | 1995-01-09 -> 2023-10-13 |
| scala di voto | 0,5 - 5,0 (mediana 3,5 · media 3,54) |
| **duplicati (utente, film)** | **0** |

**Buchi e scarti** (dichiarati):
- voti su film **senza tmdbId**: 4.726 (0,01%) -> scartati, non agganciabili al catalogo
- voti su film **senza keyword**: 374.225 (1,17%) -> scartati, il grafo non puo' rappresentarli
- **utilizzabili: 31.621.253 voti su 49.097 film** — da 84.432 film: **il 42% dei film sparisce**

## 2. Hub

| | valore |
|---|---|
| voti/utente | mediana 72 · p90 360 · p99 1.267 · **max 24.691** |
| utenti con >=1.000 voti | 3.497 (1,74%) -> fanno il **7,8% dei voti** |
| voti/film | mediana 13 · p90 796 · p99 14.150 · **max 102.929** |
| film con >=10.000 voti | 771 |
| film con <10 voti | **21.862 (44,5%)** -> ma solo lo **0,2% dei voti** |
| i 10 film piu' votati | 2,75% dei voti |

**I voti sono iper-concentrati**: quasi tutti i voti stanno su pochi film popolari, e la coda rara
(il 44,5% dei film) vale lo 0,2%. Questo spiega perche' la divisione per gusto e' delicata.

## 3. Pulizia applicata (dichiarata)

- utenti con **>= 20 voti** (525 utenti sotto soglia, 0,26%)
- film con **>= 10 voti nel gruppo** (altrimenti la co-occorrenza e' rumore)
- **tetto 1.000 voti/utente**, tenendo i **piu' recenti** (i 3.497 utenti sopra il tetto fanno il 7,8% dei voti)
- no duplicati (erano 0)
- pesatura **1/log(1+n)** sui film popolari e sparsificazione **k-NN 200** (gia' in pipeline)

## 4. La divisione per gusto

**Misura usata**: media del percentile di popolarita' dei film visti. (La MEDIANA non separa — quasi
tutti gli utenti guardano soprattutto film famosi: p10 0,94 · mediana 0,98. La "quota di film rari" e'
**degenerata**: 0 per tutti. La media e' continua e con coda reale: p10 0,90 · mediana 0,96 · p90 0,99.)
Terzili: sotto 0,97 = nicchia, sopra 0,99 = mainstream, il centro scartato.

| | **mainstream** | **nicchia** |
|---|---|---|
| voti | 6.871.463 | 12.603.458 |
| utenti | 66.233 | 65.987 |
| film | 7.042 | **22.780** |
| voti/film | 976 | 553 |
| top-10 film | Inception · LOTR · Dark Knight · Fight Club | Star Wars · Toy Story · Jurassic Park · Schindler's List |
| voti su film con <100 voti nel gruppo | 1,8% | 3,4% |

**I tre numeri che contano:**
- **film in comune: 7.038** — il mainstream e' quasi tutto *dentro* la nicchia (7.038 dei 7.042)
- **rho = +0,638** sui film in comune: i due mondi **ordinano diversamente** gli stessi film
- la nicchia aggiunge **15.742 film** che il mainstream non tocca

## 5. Cosa significa per i due classificatori

**La base c'e'.** I due mondi condividono un nucleo dove pero' **disaccordano** (rho 0,638, non 0,97),
e la nicchia ha una **coda esclusiva** di 15.742 film. Due teacher addestrati su questi due insiemi
**saranno diversi** — che e' esattamente cio' che mancava: non due obiettivi sulla stessa fonte, ma
due popolazioni.

**Cautela onesta**: il gruppo "nicchia" non e' un pubblico di nicchia — e' un gruppo con **inclinazione
classica** (i suoi film piu' visti sono i classici: Star Wars, Toy Story, Schindler's List) contro un
mainstream **moderno-blockbuster** (Inception, LOTR, Dark Knight). La differenza e' nella **coda**, non
nella massa. E la misura di inclinazione e' una scelta fra tante: la mediana non separa, la quota di
film rari e' degenerata, la media separa.

## 6. Il passo che segue

Costruire i **due teacher** (co-occorrenza SPPMI + SVD) da questi due dataset e **misurare la
specializzazione sul set curato**: il contenuto vince su tutti i tipi anche con i due mondi separati,
o finalmente uno vince sul mainstream e l'altro sulla nicchia? E' la prova che il disegno a due
classificatori esiste o no.
