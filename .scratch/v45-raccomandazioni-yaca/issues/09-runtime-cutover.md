Status: ready-for-human
Type: prototype
Blocked by: 08

# Prova del runtime sparse e criteri di cutover

## Question

Un runtime V45 può servire le richieste di YACA con latenza e memoria accettabili? Fare una prova end-to-end con un profilo, includendo caricamento sparse, seed pesati, diffusione, filtri retrieval e output degli scaffali. Misurare il picco sotto il limite Docker attuale di 512 MiB e definire soglie misurabili per autorizzare il cutover. La policy V10-off al cutover e rollback tramite release precedente è decisa in [Ownership della pipeline V45 e dei moduli graph](01-ownership-pipeline.md).

## Evidenza misurata (motore costruito, ticket ancora aperto)

`services/graph/runtime/` implementa il motore (`Engine.carica_transizione` + `raccomanda`) e il banco
`graph.runtime.bench`. Numeri rilanciati e verificati, Windows, 20 richieste da 30 semi, cap 60:

| percorso | pota | archi | RSS picco | avvio | mediana | p95 |
|---|---:|---:|---:|---:|---:|---:|
| `carica` (laboratorio) | None | 74.409.922 | 1.434,7 MiB | 8,9 s | 5,749 s | 5,891 s |
| `carica` (laboratorio) | 16 | 1.630.374 | 1.434,9 MiB | 12,2 s | 0,138 s | 0,158 s |
| **`carica_transizione`** | **16** | **1.630.374** | **190,7 MiB** | **1,05 s** | **0,134 s** | **0,147 s** |

Il triangolo V45 su disco **non è simmetrico** (73.929.164 voci differiscono da Mᵀ, 145,9% degli
archi, su tutte le 76.497 righe): simmetrizzare è obbligatorio, e `(M + Mᵀ)` su 50,6M di archi è ciò
che porta il picco a ~1,4 GiB con qualunque potatura. Quindi **la potatura a runtime non è un rimedio
alla memoria**: lo è solo l'artefatto precalcolato (`py -m graph.runtime.prepara --pota 16`, 10 MB,
stessa impronta di provenienza dentro l'npz).

## Soglie proposte (da confermare, non ancora decise)

Ancorate alle misure qui sopra con margine, per il servizio dietro i 512 MiB di Docker:

1. Avvio: picco RSS **≤ 256 MiB** con `carica_transizione` (misurato 190,7).
2. Avvio: tempo **≤ 2 s** (misurato 1,05).
3. Richiesta: p95 **≤ 300 ms** su 30 semi e cap 60 (misurato 147).
4. Nel container non si usa `Engine.carica`: la classe è di laboratorio e il suo picco (1.435 MiB) è
   oltre 2,8× il limite.
5. L'artefatto di transizione deve dichiarare la provenienza del triangolo da cui deriva; se manca,
   il servizio non parte (nessun fallback al caricamento diretto).

Manca ancora, e non è misurabile senza una decisione: il contratto degli scaffali (ticket 08) e la
prova con un profilo reale completo — cioè la parte «end-to-end» di questa domanda.
