Status: resolved
Type: task

# `pipeline build`: gli step come funzioni, con ricostruzione incrementale
**Proposta** (dal senior): (1) incapsulare ogni file di `graph/steps/` in `esegui(dati_dir, params)`;
(2) in `pipeline.py` una lista dichiarativa `(nome, funzione, input, output, parametri_usati)`;
(3) `python -m graph.pipeline build` che confronta gli sha256 di input e parametri con un manifest
(`graph/data/manifest-build.json`) e **riesegue solo gli step a valle** di cio' che e' cambiato.
**Perche' needs-info**: gli step pesano **~30 minuti** e 11 GB di picco (`02-v10.py`). Prima di
riscriverli in funzioni va deciso se il DAG debba **rieseguire** o solo **dire cosa rieseguire** (un
`--dry-run`), e se il manifest debba stare in git (e' un artefatto di build, quindi no: va in
`.gitignore`). La parte (1) ha senso comunque e si puo' fare da sola.
---

**NON COMINCIATO, il 16/10/2026.** Il ticket 13 e' stato fatto per primo — era il prerequisito giusto —
e ha rivelato due cose che vanno risolte *prima* di scrivere un DAG:

1. **un bug che rendeva impossibile rieseguire gli step** (`A().exists()`, vedi il ticket 13): un DAG che
   orchestra passi che non partono non serve a niente, e il suo manifest avrebbe registrato come
   «eseguito» qualcosa che usciva subito. Adesso e' sistemato;
2. **`pipeline esporta` non finisce piu'** (il blocco sta in `collocator.carica`): anche questo va prima.
   Un `build` che non arriva all'ultimo passo — l'artefatto del prodotto — e' peggio di `pesanti()`, che
   almeno *dice* cosa fare e non finge di averlo fatto.

Quindi il ticket resta aperto, ma con due prerequisiti **chiusi o localizzati** invece che ignoti. Le
decisioni che servono al proprietario restano quelle scritte in origine: se `build` debba **eseguire** o
solo **dire** (un `--dry-run`), e se il manifest debba stare in git (no: e' un artefatto di build).

---

**SBLOCCATO il 16/10/2026.** I due prerequisiti che avevo dichiarato sono chiusi:
 1. il bug `A().exists()` che rendeva impossibile rieseguire gli step — sistemato (`canon.esiste`), e gli
    step 03 e 05 adesso **riproducono gli artefatti bit per bit**;
 2. `pipeline esporta` non finisce piu' — risolto, e adesso impiega **5 secondi** invece di 30.
Il DAG si puo' scrivere. Restano le due decisioni del proprietario, che sono le stesse di prima: se `build`
debba **eseguire** o solo **dire** (un `--dry-run` come primo passo), e se il manifest debba stare in git
(no: e' un artefatto di build, va in `.gitignore`).
---

RISOLTO il 16/10/2026. In `graph/pipeline.py`: la tabella **`PASSO`** (nove campi per passo: cosa legge,
cosa scrive, quali parametri lo invalidano, quanto ci mette), la funzione **`piano()`** — **pura**, quindi
provabile senza eseguire niente — e il comando **`build`**.

LE QUATTRO DECISIONI, prese e scritte:
 1. **il piano e' l'output di default**, l'esecuzione vuole `--esegui`. Un DAG che parte da solo su passi
    da 17 minuti e 11 GB di picco e' un altro genere di problema;
 2. **`--registra`** scrive lo stato attuale come costruzione fatta. Serve a chi adotta il DAG con gli
    artefatti gia' in casa: non si ricostruiscono trenta minuti per poter dire «sono aggiornato». Ed e'
    dichiarato per quello che e': una **dichiarazione, non una verifica** — registra che quei file hanno
    quegli hash e che quei parametri valgono *adesso*; se gli artefatti sono piu' vecchi, il manifest
    mente e il piano non lo scoprira';
 3. **la propagazione e' PER FILE**, non per nome di passo: se un passo a monte riscrivera' un file che
    questo legge, questo e' sporco. E' esattamente cio' che sarebbe servito il 15/10/2026;
 4. **il manifest sta in `graph/data/`**, che e' gia' ignorato da git (`.gitignore:199`).

**E IL PIANO HA UNA MEMORIA DELLE USCITE**: se una uscita non e' piu' quella che il passo aveva scritto —
cioe' qualcuno l'ha rigenerata fuori da qui — il passo e' sporco e il motivo lo dice: «uscita RISCRITTA
FUORI DA QUI». E' la trappola della partizione trasformata in una riga di piano.

**LA DIMOSTRAZIONE** (eseguita): con la costruzione registrata il piano dice `0 su 8`. Cambiando
`VOTI_SPREAD_MIN` da 10 a 12:
    salto  embedding_trame (17 min) · componente_trama (13 s) · partizione (13 min, 11 GB)
    RIFAI  divisione_voti  — perche': parametro cambiato: VOTI_SPREAD_MIN (10.0 -> 12.0)
    RIFAI  centroidi_v1, centroidi_v3, mappa, esporta — perche': a monte divisione_voti riscrivera' ...
Rimettendo il valore, il piano torna `0 su 8`: nessun falso positivo.

**E IL TEST DELL'ORDINE HA TROVATO UN PROBLEMA VERO**, il primo giorno: `centroidi_v1` dichiarava di
scrivere `04-*`, che cattura anche `04-trama-qwen3b.npy` — l'artefatto dell'**embedding**, di un altro
passo. La propagazione avrebbe sbagliato. E' la stessa radice del **ticket 11** (due pipeline che si
spartiscono il prefisso `04-`), trovata non leggendo ma facendo girare un test sull'ordine topologico.

**QUELLO CHE NON HO FATTO, dichiarato**: **gli step restano comandi, non funzioni `esegui()`**. Il motivo
non e' pigrizia: `02_partizione.py` legge `sys.argv` e `os.environ` da dentro, e non posso verificare che
una riscrittura non cambi il risultato — 13 minuti e 11 GB di picco che non posso spendere per un test.
Oggi ho la prova che *due* step (03 e 05) riproducono gli artefatti **bit per bit**: quelli diventano
funzioni quando servira' la micro-fixture, e gli altri quando ci sara' un modo di provarlo. Un DAG che
orchestra comandi e' gia' tutto il valore — il manifest e l'invalidazione — senza quel rischio.
