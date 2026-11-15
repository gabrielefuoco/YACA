Status: resolved
Type: task
Blocked by: 21

# L'incremento si serve senza ricompilare: rigenerare, non ricostruire

## Il fatto che cambia tutto

Il grafo servito non si costruisce a runtime. Due artefatti precalcolati, e `prepara.py` li rifà **con
un comando solo**:

```
transizione-pota16.npz    ~10 MB,  ~1,6 M archi stocastici   -> PageRank
vicini-top100.npz         ~43 MB,  ~7,6 M archi              -> clustering/interessi
```

Costo dichiarato nel docstring del modulo stesso: picco di **~1 GB di RAM** (è il motivo per cui è
offline: nel container da 512 MiB sarebbe OOM). Non ore: minuti. E la regola critica è già scritta:

> *«Non scrive mai e non sovrascrive mai `services/graph/data/v45/` (immutabilità del freeze V45).»*

Quindi «ricompilare ogni giorno» non è la scelta in campo. Le due scelte vere:

| | come | pro | contro |
|---|---|---|---|
| **A. fondere** | le righe nuove entrano nel triangolo, `prepara.py` rigenera tutto | un artefatto solo, nessuna eccezione al caricamento | il triangolo servito cambia a ogni incremento; rollback = tenere la versione precedente |
| **B. sovrapposto** | triangolo intatto + sidecar con le righe nuove, consultato al caricamento | il freeze resta intatto, rollback = togliere un file | una seconda fonte di adiacenza, con una precedenza da definire e da testare |

## Requisiti, qualunque strada si scelga

1. **Atomicità**: chi serve non deve mai vedere un artefatto a metà. Scrittura in cartella temporanea,
   poi scambio.
2. **Rollback**: tornare alla versione precedente in un comando, senza ricostruire.
3. **Provenienza**: ogni artefatto dichiara quali righe sono incrementali, con data e fonti votanti
   (`graph.provenance.scrivi` lo sa già fare).
4. **Verifica dopo lo scambio**: `/health`, 170 cataloghi, zero vuoti — come per ogni deploy.
5. **Il freeze non si tocca**: `services/graph/data/v45/` resta immutabile in entrambe le strade.

## Da decidere qui, non prima

- **A o B**, dopo aver visto quanto costa davvero un `prepara.py` sul ferro di casa.
- **La cadenza**, che dipende dalla risposta a `needs-info` del 21: su domanda è raro, da daemon è
  quotidiano. Con cadenza quotidiana la strada B vince quasi da sola (nessuna riscrittura di 43 MB al
  giorno), con cadenza mensile la A è più semplice.
- Chi **esegue** l'incremento: un job sul server (che ha 512 MiB di limite: serve un passaggio fuori dal
  container) o una macchina di casa che pubblica gli artefatti.

## Fuori scope

La collocazione (21) e lo studente (23). Qui si parla solo di **come l'incremento arriva a chi serve**.

## Esito (11/11/2026) — la strada corta, scelta dopo aver misurato quella lunga

Estendere il canone (la strada A) costa **quattro artefatti**, non uno:

| artefatto | perché serve |
|---|---|
| `spazi-trakt.npz` | è la numerazione delle righe: senza, il titolo non ha indice |
| `metadati-canone.npz` | `NEP` e `ANIME` per la nuova riga |
| `assi-canone.npz` | tono e complessità — **calcolati da un modello**, non derivabili da un id |
| `v46-triangolo.npz` | la riga e i suoi archi inversi |

Più `prepara` per rigenerare vicini e transizione. Fattibile, ma è un progetto, non un incremento — e
gli assi sono il punto che morde: una riga con tono 0 verrebbe filtrata male da tutte le leve che li
usano.

**La strada B (scelta)**: il titolo nuovo **non entra nel grafo**, entra come *seme espanso*. Il
collocatore gli ha già trovato i sedici vicini nel canone; il pool sostituisce il seme sconosciuto con
quelli, **conservando il peso totale** (un titolo nuovo non pesa più di uno guardato davvero).

| | |
|---|---|
| modulo | `src/pool/semiNuovi.js` — `espandiSemi`, `caricaVoci`, rilettura solo se il file cambia |
| sidecar | `services/graph/data/collocatore/collocati.json`, scritto da `colloca-riga.py --scrivi-sidecar` |
| aggancio | `src/pool/index.js`, prima della chiamata al motore, con una riga di log per ogni espansione |
| rollback | togliere la voce dal sidecar. Nessun artefatto da rigenerare |
| test | `tests/semiNuovi.test.js`, 7 casi: peso conservato, età non riscritta, voce senza vicini = scarto rumoroso, file mancante = vuoto |

### Cosa resta scoperto, e va detto

Il titolo nuovo **seminа** ma non è **raggiungibile** come candidato dagli altri semi: per quello
servirebbe la riga nel canone, cioè la strada A. Il suo scaffale (`yaca_<id>_<medium>`) si può servire
dal sidecar, e non è ancora fatto: è la seconda metà di questo ticket se un giorno servirà.

### Perché è bastata

Il bisogno dichiarato era: *«il seme non si butta, altrimenti chi guarda solo roba nuova non riceve
consigli»*. Questo lo risolve con zero rischio sull'artefatto servito, e la verifica del ticket 19 dice
quando il caso si presenta: finché il contatore resta a zero, questa macchina non serve a nessuno.
