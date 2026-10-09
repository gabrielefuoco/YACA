# 33 — Test rapido dei due teacher: la precondizione c'e', la specializzazione no (ed e' invertita)

**Data**: 08/10/2026 · due teacher (SPPMI + SVD 256) dai due dataset della divisione per gusto,
valutati DIRETTAMENTE sul metro curato (senza studenti: solo le coordinate degli item).

## Il numero che conta

**correlazione fra le due matrici di similarita' sugli stessi 7.035 film: rho = +0,023**

Due spazi che ordinano gli **stessi film in modo completamente diverso**. E' la precondizione che
mancava al primo tentativo (dove i due spazi erano due obiettivi sulla stessa fonte e il contenuto
vinceva ovunque): **la divisione per gusto produce due strutture genuinamente diverse.**

## Ma la specializzazione non c'e' — ed e' invertita

| tipo | n | teacher MAINSTREAM | teacher NICCHIA | vince |
|---|---|---|---|---|
| **mainstream** | 26 | 4% (1/26) | **23%** (6/26) | **nicchia** |
| **niche** | 23 | **10%** (2/21) | 4% (1/23) | mainstream |
| franchise | 11 | 36% (4/11) | **45%** (5/11) | nicchia |
| era | 7 | 0% (0/3) | 0% (0/7) | pari |
| cult | 2 | 0% (0/2) | 50% (1/2) | nicchia |
| medium | 1 | 100% | 100% | pari |

Il teacher di **nicchia vince sui collegamenti mainstream** (6/26 contro 1/26) e quello mainstream
vince (debolmente) sui collegamenti di nicchia.

**Perche', probabilmente**: il gruppo "nicchia" e' fatto di utenti con **inclinazione classica**, e i
classici sono **il canone** — cioe' esattamente i film che una lista curata considera "il consiglio
ovvio" (Willow e Conan per LOTR sono film di canone, non blockbuster moderni). Quindi il gruppo
classico e' quello che guarda il canone, e il mio set curato chiama "mainstream" proprio il canone.

## Ma i numeri sono piccoli

26 e 23 collegamenti: differenze di 1-5 link. Solo il 6/26 contro 1/26 e' solido; il resto e' rumore.
**Un'inversione su numeri cosi' piccoli non si insegue.**

## E questo test e' un limite inferiore

| | p3@10 (tutto il set) |
|---|---|
| teacher mainstream (grezzo) | 18,5% |
| teacher nicchia (grezzo) | 31,0% |
| **la pipeline completa (studente + contenuto)** | **50,0%** |

I teacher grezzi coprono solo i film con voti e non hanno ne' metadati ne' serie. Il confronto vero
richiede gli studenti (la pipeline completa su entrambi i teacher).

## Verdetto: vale la pena spingere?

**Si', ma non per il motivo che avevamo in mente.** La precondizione c'e' (rho 0,023 = segnali
ortogonali, e i segnali ortogonali di solito *sommano*), ma **la specializzazione mainstream/nicchia
non c'e'**. Quindi:

- **Come ENSEMBLE**: si', vale la pena — un terzo segnale ortogonale al contenuto puo' aggiungere
  molto (e' la stessa logica che ha portato la fusione a 84,9).
- **Come "due specialisti"**: no — i dati non dicono che uno serve il mainstream e l'altro la nicchia.
  Dicono che sono due viste diverse, non due competenze diverse.

**Il prossimo giro e' quindi**: la pipeline completa (studente) sui due teacher e una fusione a TRE
componenti (contenuto + anno + i due teacher del gusto). Se l'ortogonalita' si traduce in punteggio,
si tiene; se no, si chiude qui e resta il baseline 84,9.
