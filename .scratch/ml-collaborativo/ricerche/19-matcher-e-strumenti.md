
# 19 — Il matcher collaborativo, e la scoperta sugli strumenti

**Data**: 08/10/2026 · banco con profili a K adattivo (≈20 semi), 75 trial, 5 contesti

## Il test che avevo proposto (e il suo esito)

**Proposta**: usare lo spazio collaborativo *come* il matcher — profilo = punto nello spazio (media
delle posizioni dei titoli amati), classifica = coseno in quello spazio, sui profili veri.

**Esito: fallisce, e nettamente.**

| sorgente | @50 | @200 | **solo popolarità** | **posizione collaborativa** |
|---|---|---|---|---|
| graph 2 hop | 4,3% | 17,3% | **12,3%** | **0,0%** |
| POOL VERO | 5,6% | 9,6% | 7,5% | 0,5% |
| caso (dal pool) | 5,6% | 9,9% | 7,2% | 0,5% |

**0,0% @50** sul 2 hop: su 75 trial, il matcher collaborativo non mette **nessuno** dei titoli amati
nella top-50. Non è rumore: è un ordinamento sistematicamente sbagliato per questi titoli.

E **la popolarità vince di 2,9×** (12,3% contro il 4,3% dello scorer) — coerente con il test set
congelato (6,1% contro 4,3%). **Due strumenti indipendenti dicono la stessa cosa: il nostro ordinamento
perde contro "i più famosi".**

## La scoperta che conta di più: gli strumenti

| strumento | chi | profilo | verità |
|---|---|---|---|
| test set congelato | 200 utenti MovieLens | **3 semi** (freddo) | ~50 titoli |
| banco "utente reale" | **1 account con 100 titoli in tutto** (20 per contesto) | ~20 semi | ~15 titoli |
| `sim_user_yaca` | **utente simulato** (costruito da me nel filone livello-latente) | — | — |

```
watchhistories: 200 documenti · REOZrGNRr3 100 titoli · sim_user_yaca 100 titoli
tasteprofiles: 10 (5 + 5)
```

**Nel database locale non esiste un utente reale con una cronologia lunga.** Tutti i numeri di prodotto
di questo filone — compreso il "3,1× sul pool" di stamattina — poggiano su **≤100 titoli**, e metà del
DB è un utente che ho costruito io.

Questo spiega, retrospettivamente, perché le misure di prodotto erano fragili: **la verità era di ~15
titoli per trial**. Non era un problema di metodo (quello l'avevo già segnalato): era un problema di
**dati**, e ora è quantificato.

## Cosa segue

Per rispondere a *qualunque* domanda di prodotto (matcher, ranker, imbuto) servono **profili lunghi
realistici**, e le fonti sono due:

1. **Il database di produzione, sul server** (`mate`): se ci sono utenti veri con cronologie lunghe, è
   lo strumento giusto — e va verificato *adesso*, perché decide se il progetto può misurare il prodotto.
2. **Profili sintetici lunghi da MovieLens** (100-300 titoli amati per utente, verità tenuta fuori): se
   la produzione non ha utenti, è l'unica strada — e non è più "igiene di misura", è **l'unico modo di
   avere una verità che non sia 15 titoli**.

## Verdetto sul matcher

**Non confermato**, su uno strumento debole. La conclusione onesta non è "il matcher non funziona": è
**"non possiamo ancora saperlo, perché non abbiamo un utente con cui provarlo"**. E la popolarità, che
vince su entrambi gli strumenti, resta il termine di paragone da battere.
