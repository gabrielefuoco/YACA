# Ticket 05 — Il voto diretto: di quanto sale il 2,2% delle serie

`Status: resolved` · 14/10/2026 · esito di `05-voto-diretto.py`, `06b-ponte-studente.py`,
`06c-loo-esatto.py`

**Risposta: da 2,2% a 35,3%.** Sedici volte lo studente dei film, ventisette volte quello delle serie,
**85 volte il caso** misurato per permutazione. Sui 506 casi in gara — vedi il tetto qui sotto —
**41,9%**.

⚠️ **Questo report è stato riscritto due volte.** Il primo numero era 29,7%, il secondo 63,7%, e
quello giusto è 35,3%. La storia della differenza è la parte utile del ticket, e sta in fondo.

---

## Il risultato

Banco identico al ticket 04 di `inserimento` (600 serie, `seed 13`), partizione V8, scelta fra le
**336 bolle-serie**, leave-one-out esatto.

| metodo | propria bolla | scollegate |
|---|---|---|
| studente dei **film** sulle serie | 2,2% | 1,8% |
| studente delle **serie** | 1,3% | 0,2% |
| **voto diretto, coseno (LOO esatto)** | **35,3%** | **0,3%** |
| voto diretto, prodotto scalare (§1.B.1 alla lettera) | 29,7% | 1,5% |
| caso | 0,298% (una bolla su 336) | — |

```
voto diretto (LOO esatto)    35.33% · caso 0.41% · lift 85.3x · kappa +0.351
```

La permutazione dà 0,41% dove `1/336` vale 0,298%: due strade indipendenti, lo stesso numero. Lift
**119×** sulle bolle-serie.

**Scollegate: 0,3%.** Due titoli su 600 finiscono in una bolla senza legami con la loro. È il numero
che conta per il prodotto, più del 35,3%.

## Il tetto: 84,3%, e il motivo non era quello che pensavo

Si sceglie fra 336 bolle-serie, ma non tutte le 600 serie del banco hanno la propria bolla fra quelle
336. Quante ne restano fuori decide il massimo raggiungibile:

| | |
|---|---|
| serie con la bolla vera in gara | **506/600 (84,3%)** = il tetto |
| escluse | 94 |
| dimensione delle loro bolle | da 16 a 151 titoli, mediana **74** |
| a maggioranza **film** | **94 su 94** |

**Le escluse non sono bolle minuscole.** Avevo scartato le bolle sotto i 5 titoli e mi aspettavo che
fossero quelle: sono invece tutte bolle **grandi e a maggioranza film**. Sono i casi **cross-medium** —
una serie che vive in una bolla di film, come *The Mandalorian* con *Guerre stellari*. Il vincolo di
medium, che ho messo per rispettare i due cataloghi del prodotto, li esclude **per costruzione**.

Ed è esattamente la popolazione che §1.B.2 voleva recuperare col ponte. Il ticket 06 misura se il
ponte la recupera: **no**.

## Dove riesce: la dimensione della bolla decide

| bolla vera | successi (LOO esatto) |
|---|---|
| 0-10 titoli | **85,7%** (6/7) |
| 10-30 | 29,5% |
| 30-60 | 36,3% |
| 60-120 | 33,8% |
| oltre 120 | 40,4% |

Il vantaggio delle bolle piccole resta, ma è molto meno drammatico di come appariva col metro
sbagliato (§ sotto). Una bolla piccola **è** un mondo stretto (isekai su Tokyo MX, K-BL) e il suo
centroide è concentrato; una bolla grande è più diffusa ma ha abbastanza segnale.

## Coseno contro prodotto scalare: 35,3% contro 29,7%

§1.B.1 dice «calcoli direttamente il prodotto scalare `S(s,b) = ⟨tfidf(s), μ_b⟩`». Preso alla lettera
dà 29,7%. Il coseno — cioè lo stesso numero diviso per `||μ_b||` — dà 35,3%. E la ragione si vede:

| bolla | `\|\|μ\|\|` mediana | successi coseno | successi prodotto scalare |
|---|---|---|---|
| 0-10 titoli | 3,49 | 85,7% | **100,0%** |
| 10-30 | 6,06 | 29,3% | **41,3%** |
| 30-60 | 10,18 | 39,1% | 40,1% |
| 60-120 | 16,12 | **43,7%** | 27,3% |
| oltre 120 | 24,45 | **45,5%** | 25,0% |

La norma del centroide **cresce con la dimensione** (3,49 → 24,45), quindi il prodotto scalare premia
le bolle grandi e diffuse: è un metro che confronta grandezze non confrontabili. Il coseno toglie quel
premio. Sui 506 casi in gara: **40,5% contro 35,2%**.

Va detto però che il prodotto scalare **vinse sulle bolle piccole** (100% contro 85,7%): lì la norma
piccola non era un premio ma la misura stessa della specificità. Il coseno è il metro giusto in
generale, ed è quello che va in produzione.

## Le due pesature dei membri

L'esperto propone di pesare i membri «per la loro purezza interna». **Non aiuta**: 28,7% contro 29,7%
col prodotto scalare. Il peso lineare vince. Pesare per il grado interno dà più voce ai titoli che
stanno al centro della bolla — che sono anche i più tipici — quindi il centroide si stringe **sul**
già-noto e diventa meno capace di accogliere un nuovo arrivato. **La pesatura uniforme è quella che va
in produzione.**

## I tre numeri, e perché erano tre

Questa è la parte da leggere.

| esecuzione | numero | cosa c'era di sbagliato |
|---|---|---|
| `05-voto-diretto.py` | 29,7% | niente normalizzazione del centroide: `v·μ`, non `v·μ/\|\|μ\|\|` |
| `06-ponte.py` | 63,7% | il leave-one-out era **incompleto**: `(S·n_b − 1)/(n_b − 1)` applicato a un punteggio **già diviso** per `\|\|μ\|\|`. La correzione sottraeva troppo poco, e la bolla vera restava gonfiata |
| `06b` → `06c` | **35,3%** | il denominatore giusto è `\|\|μ senza la serie\|\|`, non `\|\|μ\|\|` |

**Il 63,7% era il più pericoloso dei tre**, perché era il più bello: il doppio del numero vero, e con
una spiegazione plausibile pronta («il coseno batte il prodotto scalare»). È lo stesso modo di fallire
dei sei artefatti del progetto — un passaggio silenzioso di array in un `argsort` o in un prodotto
matriciale — e non l'ha fermato nessuno dei contratti del ticket 03, perché il risultato **non era
degenere**: era solo gonfiato.

L'ha fermato il fatto di rifare la misura in un altro script, con un'altra strada per la stessa
quantità. **È l'unico controllo che ha funzionato**, ed è quello da mettere in pratica: quando un
numero è troppo bello, ricalcolarlo per una via diversa.

Il leave-one-out, e perché senza di esso il numero sarebbe finto: il banco non toglie le serie dal
catalogo, nasconde il loro *comportamento*, non i metadati. La serie in esame **fa parte** del
centroide della propria bolla, e un titolo nuovo non è membro di nessuna. Contribuisce a un centroide
di 40 titoli con peso 1/40, cioè si regala il 2,5% di coseno su una scala dove i coseni veri stanno fra
0,02 e 0,2.
