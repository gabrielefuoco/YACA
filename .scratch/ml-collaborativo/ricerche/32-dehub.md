# 32 — Il test dell'accorpamento dei voti: l'ipotesi e' giusta, la cura e' gia' in casa

**Data**: 08/10/2026 · A/B PULITO: stesso codice, stessi utenti (tutti, non meta'), stesso catalogo.
Cambia UNA cosa: al massimo 2.000 voti per film (campione casuale).

## L'ipotesi

"Il rumore non sono i film di nicchia, sono i film super-popolari che hanno monopolizzato i voti."
Un film con 100.000 voti co-occorre con tutto -> il suo vettore non discrimina, e domina le coppie
positive e i primi componenti del teacher. **L'ipotesi e' corretta sui dati**: i voti sono
iper-concentrati (il 44,5% dei film vale lo 0,2% dei voti; i 10 film piu' votati il 2,75%; un film ha
102.929 voti).

## Il test e l'esito

| | **senza tetto** | **tetto 2.000** |
|---|---|---|
| hub residui (max voti/film) | 102.929 | 2.000 |
| film con >=10.000 voti | 771 | **0** |
| voti usati | 31,6M | 10,3M |
| **VERIFICA (sorgenti mai usate) — punteggio** | **84,9** | 68,3 |
| verifica p3@10 | 57,1% | 57,1% |
| verifica p2@20 | **38,9%** | 33,3% |
| **falsi amici in top-10** | **11%** | **22%** |
| **nicchia** | **54,5%** (6/11) | 27,3% (3/11) |
| mainstream | 31,2% | 43,8% |
| medium | **50%** (1/2) | 0% |
| franchise | 88,9% | 88,9% |
| era | 0% | 0% |
| tutto il set p3@10 | 50,0% | **57,9%** |

**Il tetto NON e' un miglioramento**: sulla meta' tenuta fuori perde 16,6 punti di punteggio, raddoppia
i falsi amici (11% -> 22%) e dimezza la nicchia (54,5% -> 27,3%). Vince solo sul mainstream e sul
p3@10 del set intero (dove il set intero e' quello su cui si e' calibrato: meno affidabile).

## Perche': la pipeline **gia' de-hubba**

1. il teacher SVD pesa ogni voto con **1/log(1+n)** sui film popolari
2. il PPMI **normalizza per le marginali**: un film che co-occorre con tutto ha un PMI basso
3. la sparsificazione **k-NN 200** taglia gli archi: nessun film puo' avere piu' di 200 vicini

Quindi il monopolio dei voti era **gia' corretto per costruzione**, e il tetto esplicito non aggiunge
niente: **toglie informazione** (31,6M -> 10,3M voti) e con essa il segnale della nicchia (i film di
nicchia vivono di co-occorrenze rare, ed e' la prima cosa che un tetto distrugge).

**Lezione**: un'ipotesi giusta sui dati non implica che la cura non sia gia' in atto. Prima di
aggiungere una correzione, verificare se la pipeline la contiene gia'.

## La scoperta collaterale (vale piu' del test)

L'A/B pulito ha richiesto di rifare il baseline **con lo stesso codice**, e li' e' emerso un risultato
migliore di quello che avevo riportato:

| | prima (meta' utenti, pipeline vecchia) | **ora (tutti gli utenti, stessa pipeline)** |
|---|---|---|
| VERIFICA punteggio | 78,6 | **84,9** |
| VERIFICA p2@20 | 27,8% | **38,9%** |
| **nicchia** | 18,2% (2/11) | **54,5%** (6/11) |
| medium | 0% | **50%** |
| mainstream | 43,8% | 31,2% |
| era | 0% | 0% |

E la configurazione migliore cambia natura: **contenuto 1,0 + prossimita' d'anno 0,15 (sigma 8)**,
con il **comportamento a zero**. Cioe': con tutti gli utenti e il segnale d'anno, la componente
comportamentale **non serve piu'**.

**Fragilita' da dichiarare**: la prossimita' d'anno *peggiorava* nella pipeline a meta' utenti e
*migliora* in questa. Un parametro che cambia segno fra pipeline non e' robusto: va tenuto d'occhio,
non celebrato.

## Stato attuale del metro curato (verifica, sorgenti mai usate)

| tipo | quota |
|---|---|
| franchise | 88,9% (8/9) |
| **nicchia** | **54,5% (6/11)** |
| medium | 50% (1/2) |
| mainstream | 31,2% (5/16) |
| era | 0% (0/4) |

**Il collo di bottiglia ora e' il MAINSTREAM (31,2%) e l'ERA (0%)** — non piu' la nicchia. E l'era
resta un problema di dati (i film del 1920 hanno 57 voti: il teacher non li copre).

## Prossimi passi (in ordine)

1. **I due teacher dalla divisione per gusto** (mainstream/nicchia) — il test che l'utente ha chiesto:
   ora il baseline e' 84,9, quindi si vede subito se i due mondi specializzano.
2. Il mainstream e' il nuovo collo di bottiglia: 31,2% con la nicchia al 54,5% e' un'inversione
   rispetto a ieri, e dice che lo spazio ora serve bene il pubblico di nicchia e male quello ampio.
3. L'era: servono i metadati del cinema classico (e' un problema di copertura, non di modello).
