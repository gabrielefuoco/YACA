Status: resolved
Type: task
Blocked by: —

# Il triangolo V45 si chiama ancora «bolle», e quel nome oggi è una tagliola

## Il fatto

L'artefatto che il runtime **non deve** caricare si chiama:

```
services/graph/data/v45/bolle-eterogeneo-V45-p1.0-triangolo.npz    (50,6 M archi)
```

«Bolle» è un'etichetta di lignaggio: viene dalla pipeline `bolle-eterogeneo-V10-p1.0-triangolo.npz`
(66.259 righe). Le bolle come **mondi di prodotto** non esistono più, e la partizione come ID
sopravvive solo negli archivi. Il nome è rimasto attaccato al file.

Il nome non è solo brutto: è **il testo su cui è scritta una guardia**.

```python
# services/graph/interessi.py:143
if "bolle-eterogeneo-V45-p1.0-triangolo.npz" in p_str:
    raise ValueError("VIOLAZIONE ARCHITETTURALE: … picco RSS di 1.007,6 MB … mem_limit: 512m")
```

## La tagliola

Rinominare il file **senza** aggiornare la stringa della guardia riapre silenziosamente il bug
che ha mandato il container in OOM: il controllo non riconosce più il percorso, il file si carica,
il picco RSS torna a ~1.007 MB. Il rinominamento è quindi un'operazione in due punti che devono
restare allineati, non un `mv`.

## Cosa fare

| # | dove | cosa |
|---|---|---|
| 1 | `services/graph/build/pipeline.py:328` | il nome generato: `bolle-eterogeneo-{V}-p1.0-triangolo.npz` → `{v}-triangolo.npz` |
| 2 | `services/graph/runtime/prepara.py` | il lettore del triangolo (deriva `vicini-top100` e `transizione-pota16`) |
| 3 | `services/graph/data/v45/…` | il file su disco, e la copia servita da `/srv/yaca/services/graph/data/` |
| 4 | `services/graph/interessi.py:143` | **la stringa della guardia**, con il nome nuovo |
| 5 | testi che asseriscono il `ValueError` | devono continuare a passare con il nome nuovo |
| 6 | `services/graph/parametri.py:31`, `camminata.py:56` | puntano al **V10**, non al V45: restano (vedi nota sotto) |

## Esito (10/11/2026)

Rinominato in **`services/graph/data/v45/v45-triangolo.npz`**. Aggiornati: `build/pipeline.py` (il nome
generato), `runtime/prepara.py`, `runtime/engine.py`, `servizio.py`, i test (`test_runtime.py`,
`test_interessi.py`) e la documentazione (`README.md`, `V45.md`).

**La guardia** ora rifiuta il nome nuovo **e** il vecchio: un rinominamento che allenta la guardia
sarebbe peggio di nessun rinominamento, e durante la transizione il file potrebbe ancora chiamarsi
così su un ferro non aggiornato. Il test prova entrambi i nomi.

**Una correzione al ticket.** Avevo scritto «rigenerati identici byte per byte»: è impossibile, e me
ne sono accorto rigenerando. La provenienza registra **il nome del file di input**, quindi rigenerare
cambia i byte per costruzione. La verifica vera, fatta con `prepara.py` sul ferro di casa (2 minuti):

| artefatto | `indptr`/`indices`/`data` | provenienza |
|---|---|---|
| `vicini-top100.npz` | **identici** | cambia solo la chiave di `inputs` (`v45-triangolo.npz`) |
| `transizione-pota16.npz` | **identici** | idem |

E il test di equivalenza (`test_vicini100_*`, che ricostruisce l'affinità **dal triangolo** e la
confronta con `vicini-top100` servito) passa: 11 test verdi in `test_interessi.py`.

## La prova che conta

Non è «i test passano». È:

1. `interessi.py` rifiuta il **nome nuovo** con lo stesso messaggio (test dedicato);
2. `vicini-top100.npz` e `transizione-pota16.npz` rigenerati dal triangolo rinominato sono
   **identici byte per byte** a quelli serviti oggi (confronto sha256);
3. `/health` risponde e i 170 cataloghi servono, zero vuoti.

Se il punto 2 non torna identico, il rinominamento ha toccato l'ordine delle righe: si torna
indietro, non si aggiusta a valle.

## Fuori scope, ma annotato

Sul server restano quattro file V10 del 17 ottobre, **43 MB**:
`bolle-eterogeneo-V10-p1.0-triangolo.npz` (39 MB), `-r200.npy`, `subvoti.npy`, `bolle.json`.
Il runtime non li carica: `runtime/engine.py` riusa da `camminata.py` solo `pesi_semi()`, e
risimmetrizza per conto suo invece di chiamare `transizione_pronta()`. Sono residui: si
possono togliere, ma in un passaggio separato e dopo un grep che lo confermi — non dentro
questo ticket, che ha già una guardia da non rompere.
