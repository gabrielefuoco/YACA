Status: ready-for-human
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
