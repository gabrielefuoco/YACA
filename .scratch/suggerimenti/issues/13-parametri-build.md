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

**E UN PROBLEMA APERTO, dichiarato e localizzato**: dopo queste modifiche **`pipeline esporta` non
finisce piu'** (due timeout a 900 s, EXIT=124; prima ci metteva ~30 s). Il blocco sta **dentro
`collocator.carica(v3=True)`**, dopo i metadati (0,6 s): i caricamenti dei file sono istantanei (0,1 s
ciascuno, misurato), quindi non e' I/O — e' quella funzione. NON RISOLTO. L'artefatto del prodotto e'
comunque intatto e coerente (2,53 MB, ricetta `b6607839ad84e7ae` riallineata a mano: i valori sono
provati identici, l'impronta cambiava solo perche' la tabella e' cresciuta), pytest e Jest passano, e il
prodotto serve il mondo 1084 al 63,1%. **Ma il job notturno e' rotto, e va sistemato per primo.**
