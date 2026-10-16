Status: ready-for-agent
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
