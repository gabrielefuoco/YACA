# 10 — Il test set congelato: da qui in avanti, sempre qui

**Data**: 08/10/2026 · **Script**: `build-testset.py` · **File**: `.cache/movielens/testset.json` (v1.0, congelato)

## Perché serviva (due difetti del banco precedente)

1. **Un solo essere umano.** Il banco poggiava su `REOZrGNRr3` e i suoi 5 contesti, ricampionati 15
   volte: 75 angolazioni della stessa persona. Ogni decisione presa su quel banco era una decisione
   presa su di lui — e ne ho prese una decina, oggi.
2. **Leakage.** Il teacher è costruito con **tutti** i 200.948 utenti MovieLens: chiunque usassi per
   valutare era già dentro il teacher. Le sue co-visioni erano già nello spazio denso.

## Il test set (congelato, non si ricampiona mai)

| | |
|---|---|
| utenti di valutazione | **200** (disgiunti dai futuri utenti del teacher) |
| trial | **400** (2 per utente, semi diversi) |
| seme | `20261008` — scritto nel file |
| profilo che il sistema vede | **3 semi** dalla cronologia |
| verità | il **resto** dei titoli piaciuti (mediana **51** per trial) |
| positivo | voto ≥ 4,0 (piaciuto, non "visto") |
| universo | titoli con keyword **presenti nel grafo dei film** |

**Stratificazione** (per non misurare solo il gusto mainstream):

| strato | utenti | popolarità mediana dei titoli |
|---|---|---|
| **fondo** della distribuzione | 100 | **215 voti TMDB** |
| resto | 100 | 6.922 voti |
| *(minimo assoluto fra i 139.528 utenti disponibili)* | — | *45 voti* |

## I limiti dello strumento (dichiarati, non nascosti)

1. **MovieLens non sa dare vera nicchia**: la sua "nicchia" mediana è 215 voti e solo 6 utenti su 200
   stanno sotto i 100. Il **cult profondo del catalogo resta non validato**: l'unico testimone di quella
   fascia è l'utente reale, che è uno solo. Va detto forte, perché è metà della tesi del progetto.
2. **Film soltanto**: le serie (l'80% delle cronologie reali) non sono coperte. Ticket 12, come sempre.
3. **Profili freddi**: 3 semi, non una cronologia di centinaia di titoli. Il DNA è nutrito molto meno
   che in produzione → questo test misura il caso *difficile*, che è quello giusto per un cancello.
4. **"Piaciuto" ≠ "visto"**: la produzione usa anche i visti non amati. Qui no.

## La regola d'uso

- **Congelato**: si scritto una volta, con seme fisso. Non si ricampiona, mai, per nessun motivo: un
  test set che cambia non misura più le regressioni.
- **Per strato**: ogni risultato si riporta **fondo** e **resto** separati. È il banco appaiato per
  popolarità (ticket 10) incorporato nello strumento.
- **Disgiunto**: gli utenti in `testset-users.json` vanno **esclusi** dalla costruzione del teacher.

## Il piano in 4 passi (il test set NON è ancora utilizzabile: c'è il leakage)

| # | passo | costo |
|---|---|---|
| 1 | ricostruire il teacher **senza** i 200 utenti (`.cache/movielens/teacher-Z-heldout.npz`) | ~4 min |
| 2 | ricostruire il grafo dei film su quel teacher (`film-graph-heldout.npz`) | ~10 min |
| 3 | riesportare i candidati sui 400 trial | ~2 min |
| 4 | girare il banco → **la linea di base di riferimento** | ~15 min |

Da lì in avanti: **qualunque** modifica (adiacenza, dosaggio, node2vec, feature) si misura con gli
stessi 4 passi sugli stessi 400 trial. Miglioria o regressione, senza discussioni.

## Perché vale la pena di ricostruire invece di "tanto è solo lo 0,1%"

I 200 utenti sono lo 0,1% della massa del teacher, quindi l'influenza *per utente* è minuscola. Ma il
canale di leakage non è la massa: è che i **loro titoli** (che nel test set sono mainstream, e quindi
condivisi con milioni di altri) sono già nel teacher — e il teacher è ciò da cui nasce il grafo che
stiamo valutando. Con un test set costruito su titoli popolari, questo canale è largo.
**30 minuti di calcolo per un riferimento pulito che servirà per mesi: si fa.**
