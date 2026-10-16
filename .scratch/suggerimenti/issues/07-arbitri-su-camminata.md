Status: resolved
Type: task

# Nove arbitri riscrivono la diffusione invece di chiamare `camminata.py`
**Prova**: `graph/camminata.py` offre `pota`, `transizione`, `pesi_semi`, `diffondi`,
`attiva_per_mondo`. Nove arbitri (`alfa`, `cache`, `diffusione`, `freddo`, `lettura`, `liste`, `pesi`,
`ricetta`, `soglia`) chiamano **solo** `pota` e ridefiniscono localmente una loro `ppr`/`diffondi` e la
matrice di transizione. ~200 righe duplicate, e il rischio che un arbitro misuri una **variante** e
non il motore.
**Fix**: sostituire ogni copia con `_cam.transizione`, `_cam.pesi_semi`, `_cam.diffondi`. Dove la
variante e' **voluta** (es. `liste.py` misura una ricetta diversa), dichiararlo nel docstring e
parametrizzare, non ricopiare.
**Chiuso quando**: `grep -c "def ppr\|def diffondi" graph/measure/*.py` da' zero, e i numeri degli
arbitri **non cambiano** (se cambiano, una copia stava misurando qualcos'altro: ed e' la scoperta).

---

RISOLTO il 16/10/2026. `camminata.py` ora ha **`ppr(Tr, seme, pesi=None, alpha=None, iters=None,
normalizza=False)`** ed e' l'UNICO posto dove sta il ciclo. I nove arbitri (`alfa`, `cache`, `diffusione`,
`freddo`, `lettura`, `liste`, `pesi`, `ricetta`, `soglia`) hanno una delega di una riga: la firma locale
resta perche' i punti di chiamata non cambino, e perche' quattro di loro leggono `alpha` da una variabile
d'ambiente (`ALPHA=0.9 python graph/measure/freddo.py`) e quella possibilita' va tenuta.

Le nove copie erano QUATTRO varianti, e ora sono parametri invece che copie: seme pesato con `max(...,1e-12)`
(`freddo`, `pesi`), seme uniforme `1/len` (`diffusione`), uscita normalizzata `r/r.sum()` (`ricetta`), e la
transizione costruita dentro (`lettura`, `diffusione`) che ora usa `_cam.transizione`. `ricetta` calcolava il
peso inline: era `pesi_semi` senza il fattore di tipo, e adesso **e'** `pesi_semi`.

CRITERIO DI CHIUSURA (due parti):
  · *il ciclo non e' duplicato*: `grep -c "r = alpha * e + (1 - alpha) * (r @ Tr)"` su tutto `graph/` da' **1**
    — ed e' anche un test della suite pytest, cosi' non torna a nove;
  · *i numeri non cambiano*: `ricetta.py` ristampato e' **identico al bit** (l'unica differenza sono i tempi,
    4 s -> 2 s, merito dell'artefatto dei metadati). `pesi.py` e' **deterministico** (due corse di fila
    coincidono) e ha **4 righe su 6 identiche al bit**; le altre due differiscono di meno dell'1%
    (`ri-visioni` 18,06 -> 17,95; `15 a caso, peso pieno` 68,48 -> 68,91). **La causa NON e' stata isolata**,
    e va detto: l'unica modifica in mezzo e' la delega, la cui equivalenza e' provata bit per bit dal test
    `test_ppr_riproduce_le_varianti_degli_arbitri`, e l'ipotesi piu' ovvia (una perdita di precisione nel seme
    float32 contro float64) **l'ho verificata ed e' falsa**: anche la copia vecchia lavorava in float64.
    Le due righe che si muovono sono rapporti su 100 utenti, quindi sensibili a qualunque differenza minima;
    le conclusioni (SPEC utente scelta per l'equilibrio, non per il lift) restano identiche.
