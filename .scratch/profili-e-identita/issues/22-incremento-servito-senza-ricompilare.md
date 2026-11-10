Status: ready-for-human
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
