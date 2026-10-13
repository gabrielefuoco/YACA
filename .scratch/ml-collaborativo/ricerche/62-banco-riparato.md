# 62 — Il banco riparato: due popolazioni, e l'artefatto che vince sempre

**Il mandato**: riparare il teacher, cioè dare un vettore a **ogni** sorgente senza dipendere dal fatto che la sorgente sia un bersaglio della curatela.

**L'esito**: il banco **è riparato** (tutti i teacher coprono il 100% delle sorgenti), e riparandolo si scopre la cosa più importante di tutte: **sull'asse della "qualità esperta" l'artefatto batte qualunque metodo vero**. Il controllo «ordine di indice» fa **34,01% @10** sulle sorgenti calde e **14,96%** sulle fredde, contro i **28,53%** e **2,44%** della camminata. Qualunque metodo che produca un ordine anche solo vagamente correlato all'indice dei nodi sembra ottimo.

Script: `diagnosi-teacher.py` · `teacher-riparato.py` (228 s).

---

## 1. La diagnosi: non è la soglia PMI, è la struttura

Tre spiegazioni candidate per il teacher nullo su 166 sorgenti, e la risposta:

| spiegazione | sorgenti | verdetto |
|---|---|---|
| la soglia PMI (`- log 10`) azzera i pesi | 83/246 sopra soglia | ✗ **falsa**: sopravvive il **100%** dei pesi (PMI grezzo mediano **5,97**, soglia 2,30) |
| la sorgente non compare in nessun arco del train | 83/246 con riga non vuota | ✓ **vera** |
| la sorgente non compare come **bersaglio** di un legame di train | **83/246** | ✓ **vera, ed è la stessa cosa** |

Le tre segmentazioni danno **le stesse 83 sorgenti**. Il motivo: `archi_curatela(train)` mette **entrambe le direzioni** di ogni legame, e le sorgenti di test non sono sorgenti nel train (sono dispari) — quindi l'unico modo di avere un arco è **essere il bersaglio** di un legame pari.

**Conseguenza**: le 83 sorgenti hanno archi di curatela **in entrata** nel grafo, che è simmetrico → **non sono cold start**. Le 163 non hanno nessun arco → **cold start veri**.

E il numero di link per sorgente è **identico** nelle due popolazioni (mediana 4): non è "più link, più facile".

| popolazione | sorgenti | legami | camminata @10 | @100 | @500 |
|---|---|---|---|---|---|
| **CALDE** — il titolo è già nel mondo curato | 83 | 347 | **28,53%** | **49,28%** | 67,72% |
| **FREDDE** — cold start vero | 163 | 655 | **2,44%** | **14,66%** | 40,76% |

**Dodici volte al @10, con lo stesso numero di link.** Sono due domande di prodotto diverse, e l'aggregato (11,48%) le media in una cosa che non significa niente.

## 2. Il banco riparato

Quattro teacher, tutti indipendenti dalla curatela, **verificati** per copertura:

| teacher | sorgenti CALDE con vettore nullo | FREDDE con vettore nullo |
|---|---|---|
| **metadati (Kc)** | 0/83 | **0/163** |
| **CFst** (pubblico previsto) | 0/83 | **0/163** |
| co-visione Trakt | 0/83 | 3/163 *(trascurabile)* |
| metadati + CFst | 0/83 | **0/163** |

**Il banco ora si può usare**: nessuna sorgente degenera, quindi nessuna fusione può gonfiarsi per degenerazione.

## 3. I risultati, separati

### CALDE (83) — il titolo è già nel mondo curato

| | @10 | @50 | @100 | @500 |
|---|---|---|---|---|
| **camminata sola** | **28,53%** | **45,82%** | **49,28%** | 67,72% |
| teacher solo — CFst | 2,59% | 8,93% | 14,70% | 34,01% |
| teacher solo — metadati | 0,29% | 2,02% | 4,61% | 18,44% |
| RRF +CFst k=60 | 25,07% | 46,11% | 49,86% | 66,86% |
| RRF +metadati k=60 | 25,36% | 45,53% | 49,57% | 67,15% |
| **RRF +INDICE (controllo)** | **34,01%** | **60,81%** | **65,42%** | **73,20%** |
| RRF +CASUALE (controllo) | 4,03% | 29,97% | 48,70% | 68,30% |

**Nessuna fusione vera aiuta**: la camminata è già a 28,53% e tutte le fusioni la portano a 24-25%. **La camminata lì ha già tutto** — la sorgente è dentro il mondo curato e il grafo la tocca.

**E il controllo INDICE fa 34,01% @10**: meglio di tutto. L'artefatto vince.

### FREDDE (163) — cold start vero

| | @10 | @50 | @100 | @500 |
|---|---|---|---|---|
| **camminata sola** | 2,44% | 7,33% | 14,66% | 40,76% |
| teacher solo — CFst | 2,14% | 8,24% | 12,37% | 31,15% |
| teacher solo — metadati | 0,46% | 4,27% | 6,41% | 22,14% |
| **RRF +CFst k=60** | **2,75%** | **7,79%** | **15,42%** | **41,53%** |
| RRF +CFst k=3000 | 1,98% | 7,63% | 15,11% | **42,90%** |
| RRF +metadati k=60 | 2,44% | 6,41% | 14,20% | 40,31% |
| **RRF +INDICE (controllo)** | **14,96%** | **27,18%** | **31,91%** | **48,24%** |
| RRF +CASUALE (controllo) | 0,76% | 5,50% | 12,06% | 40,61% |

**Qui la fusione aiuta, poco ma davvero**: `CFst` porta il @10 da 2,44% a **2,75%**, il @100 da 14,66% a **15,42%**, il @500 da 40,76% a **41,53%** (e a 42,90% con `k=3000`). È il **solo guadagno reale** su questo banco, ed è **dove il prodotto ne ha più bisogno** — un titolo nuovo, che nessuno ha mai collegato.

**E il controllo INDICE fa 14,96% @10: sei volte la camminata.** L'artefatto vince anche qui.

## 4. La cosa da dire ad alta voce: questo banco premia gli artefatti

Il controllo «ordine di indice» — che non contiene **niente** — è il **migliore risultato su entrambe le popolazioni**: 34,01% e 14,96% al @10, contro 28,53% e 2,44% della camminata vera. E il controllo casuale è piatto (0,76% sulle fredde), quindi la differenza non è "un po' di rumore": è che **l'ordine di indice è correlato con la struttura del gold**.

**Il motivo**: i nodi sono ordinati per `tmdb`, e il gold è un insieme di serie e film scelti da un curatore. C'è una relazione sistematica fra l'indice di un nodo e la probabilità che sia nel gold. La fusione per ranghi, che lavora sui ranghi, **la amplifica**.

**Conseguenza pratica**: su questo banco, **qualunque metodo va confrontato col controllo INDICE prima di essere creduto**. Se non lo batte, non ha dimostrato niente. E il numero del report 41 (18,90% @10) **non lo batteva**.

## 5. Cosa dicono i numeri onesti, in una tabella

| domanda | risposta | numero |
|---|---|---|
| Un titolo **già nel mondo curato** si collega bene? | **sì** | camminata @10 **28,53%** · @100 **49,28%** |
| Un titolo **nuovo**, mai collegato? | **no** | camminata @10 **2,44%** · @100 **14,66%** |
| Si può migliorare il titolo nuovo? | **poco** | +0,31 @10 · +0,76 @100 con `CFst` |
| Si può migliorare il titolo già noto? | **no** | le fusioni lo peggiorano (28,53% → 25,36%) |
| Quanto vale l'artefatto? | **moltissimo** | +5,48 e +12,52 al @10 — più di ogni metodo vero |

## 6. Perché i metadati aiutano il catalogo serie (Trakt) e non il gold curato

Sembra una contraddizione col report 60 (+77% sul catalogo serie) e non lo è:

- **il catalogo serie (Trakt)** ha per gold **il comportamento**: cosa le persone hanno guardato. I metadati lo predicono un po' — dicono "questa serie assomiglia a quella", e chi guarda una guarda l'altra.
- **il gold curato** ha per gold **il gusto di un intenditore**: quali legami *lui* scriverebbe. I metadati non lo predicono, perché non è comportamento.

**Il teacher giusto dipende da cosa si sta misurando.** E questo è coerente con tutto il resto: le foglie raggruppano per pubblico e non per contenuto (report 61), e i metadati non contengono il comportamento (report 51).

## 7. Cosa cambia per il prodotto

1. **La colonna "qualità esperta" del report 57 va buttata**, come la frontiera che ci stava sopra: era misurata su un banco che mescola due popolazioni e che premia l'artefatto.
2. **Il numero da usare è la camminata sola, separata**: 28,53% @10 sulle calde, 2,44% sulle fredde.
3. **Il lavoro vero è sulle fredde** — i titoli nuovi — ed è lì che il prodotto ha il problema: un titolo appena aggiunto al catalogo si collega **dodici volte peggio** di uno già noto. E l'unico rimedio misurato è `CFst`, che porta +0,31. **Non basta.**
4. **Il catalogo serie (Trakt) resta il banco sano**, perché il suo gold è comportamento vero e non ha queste due popolazioni.
