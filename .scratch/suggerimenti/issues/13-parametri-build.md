Status: needs-info
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
