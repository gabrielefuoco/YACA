# Ticket 03 — I contratti, e il retro-test sui sei artefatti

`Status: resolved` · 14/10/2026 · esito di `03-contratti.py` (0 s) e `01-bug.py`

**Esito: 6 artefatti su 6 fermati, zero falsi allarmi.** Ma ci sono voluti **quattro contratti** invece
dei tre chiesti da §4 — e la ragione è che il retro-test ha smascherato **tre errori nei contratti
stessi**, non negli artefatti. È il punto del ticket: un contratto che non fallisce su un bug vero non
è un contratto, e va scoperto prima di consegnarlo.

---

## I contratti attivi

| contratto | dove | cosa ferma |
|---|---|---|
| **anti-pareggio** | `canone.py:ranghi()`, entrambi gli assi | top-50 costante **o** oltre metà dei primi 50 pari al massimo |
| **di verso** | `canone.py:assert_ordine()` | un ordinamento rovesciato (`argsort` in più) |
| **di simmetria** | `canone.py:assert_simmetrica()` | `row < col` su una matrice asimmetrica |
| **di scala** | `canone.py:assert_modello()` | una previsione costante o senza relazione col target |
| **tasso base** | `canone.py:tasso_base()` / `stampa_tasso()` | la convenzione: mai una percentuale senza il suo caso |
| **non-vuotezza** | `bolle.py:assert_componente()`, chiamato in `costruisci_insiemi` | un componente azzerato |

## Il retro-test, artefatto per artefatto

| artefatto | contratto che lo ferma | esito |
|---|---|---|
| **il teacher nullo** (report 58) — `Cf` con 16.550 serie a zero | anti-pareggio, pareggi in testa | fermato |
| **una classifica a metà pareggiata** (400 righe identiche) | anti-pareggio, pareggi in testa | fermato |
| **la maschera `Pn = 0.0`** sulle serie (`inserimento`) | anti-pareggio, **righe** | fermato |
| **l'inversione** di `verifica-popolare.py` | di verso | fermato |
| **`row < col`** su matrice asimmetrica (D2) | di simmetria | fermato |
| **il riferimento del report 41** (matrice sbagliata) | di scala | fermato |
| **il tasso base del 79,4%** | tasso base (convenzione) | ridimensionato: lift **1,18×** |

E i due controlli negativi — popolarità ordinata bene, matrice simmetrizzata, modello correlato —
non accendono nessun allarme. Un contratto che strilla sempre viene spento al primo giorno.

---

## I tre errori che il retro-test ha trovato **nei contratti**

Vanno scritti, perché sono la parte utile del ticket.

**1. `assert_ordine` misurava la cosa sbagliata.** Il primo tentativo correlava il **vettore dei
ranghi** col segnale. Con `voti = [100, 50, 10, 5, 1, 900, 300]`, `np.argsort(np.argsort(voti))` dà
una correlazione **+0,794**: *positiva*, perché il rango crescente è una funzione crescente dei voti.
Quindi il contratto dava il via libera **proprio al bug di `verifica-popolare.py`** e fermava invece
l'ordinamento corretto. Il verso va misurato sull'**ordine di presentazione** (`segnale[ordine]`
contro la posizione), non sul rango. Corretto.

**2. `assert_modello` aveva una soglia senza significato.** Chiedeva `|r| > 1e-6`: un modello che
restituisce rumore ha `r = 0,008` e **passava**. La soglia ora è dichiarata (`min_r = 0.2`) e una
previsione **costante** viene segnalata a parte, perché è il sintomo esatto della matrice nulla del
report 58. Il caso riprodotto ora si ferma con `r = +0.0081`.

**3. L'anti-pareggio guardava un asse solo, e solo lo span.** Due lacune trovate dal retro-test:
- `ranghi` classifica **per colonna**, ma l'artefatto delle serie era una **riga** costante (lo
  scoring si fa riga per riga, una sorgente contro tutti i candidati). Ora controlla **entrambi**.
- lo span non-zero non basta: una classifica può avere lo span giusto e il **top-50 tutto pari**.
  Il criterio dei pareggi in testa — quello che l'esperto propone in §4 — è ora nel contratto
  (`pareggi_max = 0.5`), con il falso allarme dichiarato: chi ordina per `vote_count` (valori
  interi, molti pareggi legittimi) deve alzare la soglia **e dirlo**.

**E una lacuna che resta, dichiarata.** Una classifica **sparsa ma legittima** — tre titoli con un
punteggio, 497 a zero — non viene fermata. Non è un difetto aggirabile: **solo il chiamante sa
quanti candidati dovrebbero avere un punteggio**. Per questo la copertura si stampa invece di
imporla, e l'assert guarda i pareggi in testa. È scritto nel codice e nella controprova del test.

---

## Una nota sul contratto di simmetria, dal retro-test

Nel caso D2 il danno è visibile in una riga: su 4000 archi simulati, **1.938 salgono e 1.963
scendono**. Leggendo il triangolo superiore, quei 1.963 spariscono senza che nessuno se ne accorga —
le classifiche restano distinte, ordinate e sbagliate. È l'artefatto più silenzioso dei sei, ed è
l'unico per cui serviva un contratto **nuovo**: i tre di §4 non lo vedono.

## Il tasso base, applicato al caso che l'ha generato

L'adiacenza fra bolle, misurata con `stampa_tasso`:

```
adiacenza, come l'abbiamo letta       79.38% · caso 67.26% · lift 1.2x · kappa +0.370
```

Un `lift` di **1,18×** su 1.037.438 archi in 1.306.536 coppie. Il «100% nel quartiere giusto» che
era stato riportato valeva **1,2 volte il caso**, e con la convenzione in vigore non sarebbe mai
stato scritto senza quel numero accanto.
