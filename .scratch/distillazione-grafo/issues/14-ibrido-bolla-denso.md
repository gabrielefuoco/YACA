Status: wontfix
Type: research

# 14 — L'ibrido collocatore + denso: ritirato (premessa leaky)

Misurato: bolla dal collocatore V1 + ranking denso dentro la bolla = **28,5%** di recall@20
(12,7% del denso puro), 32,3% con la bolla oracolo. Numeri che sembravano un raddoppio.

**Perché è ritirato.** I centroidi del collocatore sono costruiti su **tutti** i membri della
bolla, **titolo di test compreso** (il docstring di `collocator.py` lo dichiara: il leave-one-out
serviva «a non autoconfermarsi in laboratorio»). Nearest-centroid onesto sullo stesso `X_meta`,
centroidi dai soli membri di training:

| nearest-centroid su `X_meta` | own |
|---|---:|
| senza i titoli di test (onesto) | **18,6%** |
| con i titoli di test (come il collocatore) | 40,9% |

Il 78,6% del collocatore è quindi in larghissima parte self-inclusion, non capacità: in produzione
un titolo nuovo non è in nessun centroide. Il numero onesto è ~19%, cioè **il nostro modello**.
L'ibrido non è un'architettura, è un escamotage da laboratorio: fuori.

**Cosa resta valido della misura**: il 48,5% dei vicini top-20 sta nella stessa bolla (vero, ma
irraggiungibile senza sapere la bolla); il ranking denso dentro la bolla oracolo recupera 32,3%,
quindi il collo di bottiglia non è il ranking intra-bolla.

**Conseguenza**: niente bolla esterna al modello. Il prossimo passo sono le **feature** (ticket 15).
