Status: resolved
Type: task

# I parametri di COSTRUZIONE sono ancora cablati dentro gli step
**Prova**: `parametri.py` governa la camminata e le liste, ma `RICETTA` in `pipeline.py` e' **solo
testo descrittivo**: gli step hanno i numeri cablati dentro (`TOPK=30`, `SOGLIA=0.30` in
`01_componente_trama.py`; `beta=0.25`, `alpha0=0.1`, `min_sim_kw=0.12`, `quanti_nucleo=4` in
`02_partizione.py`; `SPREAD_MIN=10.0`, `MIN_MEMBRI=15`, `RISOLUZIONI=(...)` in `03_divisione_voti.py`;
`TETTO=20.0`, `PESI_TIPO={...}`, `FATTORE_VOTI=10.0`, `MARGINE=1.0` in `04_centroidi.py` **e**
separatamente in `collocator.py`). Cambiare un peso in un file e non nell'altro li disallinea in
silenzio.
**Perche' needs-info**: unificare significa **toccare la ricetta che ha prodotto gli artefatti attuali**
(impronta `5026703db53a4ba7`). Va deciso col proprietario se: (a) `parametri.py` diventa la fonte e la
ricetta si **riproduce** (gli artefatti cambiano impronta, e va rifatta la verifica), oppure (b) si
registrano i valori **storici** come «ricetta congelata» e i nuovi come override dichiarati.
---

RISOLTO il 16/10/2026, con una prova che prima non esisteva. **19 parametri di costruzione** sono entrati
in `parametri.py` (sezione `COSTRUZIONE`) e i sette step piu' `collocator.py` li leggono da li': i
default sono i valori con cui sono stati costruiti gli artefatti attuali, e le vie di scampo da riga di
comando (`RES=100`, `python steps/03... 8 15`) sono rimaste.

**LA DUPLICAZIONE E' MORTE**: `PESI_TOKEN` era scritto DUE VOLTE — in `steps/05_centroidi_v3.py` e in
`collocator.py` come `PESI_TIPO` — ed e' esattamente la classe di errore denunciata: cambiarne uno solo
non faceva fallire niente, faceva scivolare i punteggi. Adesso c'e' una fonte sola. Idem per `MARGINE`.

**GLI ARTEFATTI SI RIPRODUCONO**, ed e' la prova che l'estrazione e' fedele:
  · `steps/03_divisione_voti.py` -> `bolle-eterogeneo-subvoti.npy` = **cf1d80dcba3eddce, identico**
  · `steps/05_centroidi_v3.py`     -> `05-centroidi.npz` = **e7fcaab56142b345, identico**
  · 15 valori su 15 della tabella coincidono coi cablati (0 sbagliati)
NON rieseguiti, e dichiarato: `04_centroidi.py` (oltre 15 minuti, interrotto: l'artefatto e' rimasto
INTATTO, verificato), `06_mappa.py`, e i tre pesanti (`00` ~17 min, `01`, `02` ~13 min e 11 GB).

**E UN BUG VERO, TROVATO PROPRIO PERCHE' HO PROVATO A RIESEGUIRE.** Sette file facevano
`K.A(nome).exists()` per *testare* se un artefatto c'era — ma da handoff 5 `canon.A()` **solleva** se
manca (era il fix dei ripieghi silenziosi, giusto). Quei sette `if` erano diventati **bombe**: il ramo di
ripiego che dovevano proteggere non si e' mai piu' eseguito. Effetto concreto: `steps/03_divisione_voti.py`
cercava il triangolo in tre nomi (`-r200`, `-r200`, `-p1.0`), il file giusto c'era, e **lo step non
partiva lo stesso**. Tradotto: gli artefatti attuali non erano piu' riproducibili da nessuno.
Rimedio: `canon.esiste(nome)` (il compagno non severo di `A()`) e i sette chiamanti sistemati. Il sintomo
era chiaro, la causa no: la colpa era di un `if` che sembrava prudente.

**PROBLEMA APERTO, RISOLTO IL 16/10/2026 — e la causa era mia, in una riga.** `pipeline esporta` non
finiva piu' (due timeout a 900 s). Lo stack l'ha detto: `collocator.carica` -> `_mediane_voti` (riga 66:
`B.ROW_OF.get(...)` dentro un ciclo su **117.000 righe per parquet**) -> `bubbles.__getattr__` -> `canon.titoli`.
E `titoli()` **non era piu' cachata**: quando ho inserito `canon.esiste()` con uno script, l'ancora era
`def titoli():` e il testo nuovo e' finito **fra il decoratore `@functools.lru_cache` e la sua funzione** —
lasciando il decoratore appiccicato a `esiste`. Cosi' ogni accesso a una costante di `bubbles` ricostruiva
le 66.259 chiavi e il dizionario:
    100.000 accessi a `B.ROW_OF`:  **2.488 secondi** -> **0,05 s**
In `_mediane_voti` sono 234.000 accessi: **97 minuti**. Ecco l'«hang».
Adesso `esporta` finisce in **5 secondi** (era ~30 prima del refactor: piu' veloce, perche' ora `titoli()`
e' cachata *e* i metadati sono un artefatto — due lavori di oggi che si sommano). Artefatto riscritto dal
comando vero, non a mano: ricetta `b6607839ad84e7ae`, 2,54 MB, pytest 12/12, Jest 4/4.

**LA LEZIONE, e vale piu' del bug**: lo script aveva stampato «sostituito e compila», e il file **compilava
davvero** — un decoratore appiccicato alla funzione sbagliata e' Python perfettamente valido. Il controllo
di compilazione non e' un controllo di correttezza. Ed e' il **terzo** effetto collaterale di un edit
scriptato in questa sessione (l'import di `ppr` messo in fondo al file, i percorsi `/tmp` fra bash e
Windows, e questo): gli script restano lo strumento giusto per 9-19 rimpiazzi verificabili, ma i loro
controlli devono guardare la **struttura**, non solo che il file si carichi.
