Status: resolved
Type: prototype
Blocked by: 03

# Prototipo dei cluster d'interesse personali

## Question

Quale metodo raggruppa i segnali di un profilo in interessi distinti senza appiattirli in un solo topic? Prototipare, su storie reali anonimizzate e casi sintetici, almeno due alternative: raggruppare i seed per affinità V45 e raggruppare la distribuzione di attivazione dopo la diffusione. Per ciascuna mostrare i cluster risultanti, i titoli suggeriti per cluster e i motivi; scegliere dopo aver controllato topic drift e copertura dei segnali love/like/library/recenti/liste.

## Risultato misurato — prototipo in `prototipo/`

Prima versione **artefatta**: tetto a 6 cluster e soglia 0,06 non provata facevano sembrare che il metodo
trovasse solo saghe. Riscritto con criterio dichiarato **prima** dell'osservazione (copertura ≥60%,
≥50% dei cluster non-saga, mediana 4-30 semi) e sweep della soglia su {0,005 0,01 0,02 0,04 0,06}:

| strategia | soglia | copertura | cluster | mediana | saga (coll. identica) | esito |
|---|---:|---:|---:|---:|---:|---|
| **A affinità coseno V45** | **0,02** | **80,3%** | **200** | **4** | **8,5%** | **passa** |
| B vicinato condiviso | 0,02 | 74,4% | 205 | 4 | 10,7% | passa, copertura minore |
| C solo co-visione+RESID | 0,02 | 92,0% | 57 | 4 | 14,0% | collasso: un cluster da 444 semi |

La variante C mostra perché il segnale comportamentale da solo non basta: massimizza la copertura ma
fonde quasi tutta la storia in una componente gigante. **Conferma da parte dell'umano ancora mancante**
on «A a soglia 0,02» come metodo.

**Correzione alla metrica saga** (verificata a mano su `warnok`, 476 semi): il rilevatore usato conta
solo chi condivide la **stessa** `collection_id`, e sottostima i franchise sparsi su più collezioni
(MCU, Jurassic, Apes). Con «almeno una collezione nel 50% dei membri» la quota passa dal **10% al
26,7%**, e il cluster più grande classificato non-saga ha il **45%** di membri in collezione. Il
criterio passa lo stesso (27% < 50%), ma il numero corretto è ~27%, non 8,5%.

**Il dato che cambia il progetto**: un profilo da 400+ semi ha **70-76 cluster naturali** a tetto
aperto (copertura 77-93%), non 6. Gli scaffali non possono essere uno per cluster: serve una
selezione con una regola esplicita (ticket 08).

**Difetto trovato nel prototipo**: il filtro di medium è applicato al profilo, non al cluster — per
questo il cluster anime di `warnok` (semi tutte serie) raccomanda solo lungometraggi. Va nel ticket 07.


## Ricetta misurata (conferma dell'umano: seconda passata + selezione per recenza e massa)

L'umano ha proposto: seconda passata per accorpare quando i cluster sono troppi, e selezione per
recenza e per numero di elementi a supporto. Misurata, con condizioni di fallimento dichiarate prima.

**Micro** - affinita coseno V45, soglia 0,02, tetto 60. Copertura 80,3%, 200 cluster su 8 profili,
mediana 4 semi.

**Macro - limitati per DIMENSIONE, non per numero.** Raggruppare "fino a k macro" produce sempre un
blob: a k=12 il macro piu grande di `warnok` e **264 semi su 476 (55%)**, cioe la dieta principale
dell'utente (MCU, Deadpool, Kingsman, Fast, Spider-Man). La bisezione ricorsiva finche ogni macro
<= 30 semi lo spezza in nicchie leggibili (MCU / Star Wars-Indiana Jones / sci-fi di sopravvivenza /
action Netflix). Verificato: M=30 -> 31 macro, max 29, mediana 12, copertura 87,2%; M=20 -> 42 macro,
max 20; M=40 -> 28 macro, max 37. **M=30 e la scelta.**

**Recenza: `min_eta`, non la mediana.** Test dichiarato in anticipo: il macro col seme piu fresco deve
entrare nei 5 scaffali. Su `warnok` il seme piu fresco sta al **rango 1** con `min_eta` e al **rango
28 di 31** con la mediana - la mediana penalizza le passioni continuative, che hanno coda storica.
`massa_recente` (quota di semi <=90 giorni) fallisce su un profilo (rango 9). Vittoria: `min_eta` 8/8.

**Selezione**: rango combinato `(rank_min_eta + rank_supporto)/2`, 5 scaffali, filtro medium **per
macro** (non per profilo), dedupe di famiglia (collezione dominante) e scarto degli scaffali con
overlap >=50% sui top-10. Il controllo senza passata macro produce scaffali ugualmente nitidi ma
seppellisce i consumi diffusi in coppie/terzetti; la versione bounded li recupera senza mai superare
29 semi.


## Affinita: tre definizioni misurate, una vince (e la mia ipotesi e sbagliata)

| metodo | soglia | copertura | cluster | mediana | saga (b) | esito |
|---|---:|---:|---:|---:|---:|---|
| per-ragione (famiglie di tipi) | 0,02 | 88,1% | 213 | 3 | 13,1% | fallisce (mediana < 4) |
| **vicinato largo (top-100)** | **0,02** | **94,2%** | **128** | **4** | **10,9%** | **passa** |
| solo contenuto | 0,02 | 89,2% | 319 | 3 | 16,6% | escluso per decisione, non per misura |

**La mia ipotesi e stata falsificata dalla misura.** L'affinita «per ragione» doveva separare meglio le
saghe; separa **peggio**: rapporto intra/inter-franchise 18,2x contro 26,9x del metodo attuale
(-32%). Su `warnok`, coppie della stessa saga: 0,3786 medio contro 0,5407; coppie di saghe diverse:
0,0208 contro 0,0201, cioe **il rumore inter-franchise non scende** (Deadpool, Kingsman e Fast X
condividono cast, crew, co-visione e pubblico). Il vincolo di accordarsi su piu famiglie deprime la
coesione interna dei franchise piu di quanto pulisca il rumore esterno.

**Metodo scelto: vicinato largo.** Firma = top-100 vicini della matrice V45 NON potata, coseno.
La camminata resta a 16 archi. Con la ricetta (macro <=30 semi, 5 scaffali per `min_eta` + supporto,
medium per macro, dedupe di famiglia) i 5 scaffali di `warnok` sono: serie mystery/cult, K-drama e
crime asiatico, shonen, fantascienza d'invasione, animazione adulta — nessun blob generico di blockbuster.

Il metodo «solo contenuto» e stato scartato dall'umano per principio (il grafo raggruppa per natura);
i suoi numeri restano nel report ma non e un candidato.
