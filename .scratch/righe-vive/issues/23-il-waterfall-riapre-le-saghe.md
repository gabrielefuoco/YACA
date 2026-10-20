Status: ready-for-agent
Type: task
Blocked by: 22

# 23 — Il waterfall riapre le saghe che l'anti-monopolio aveva chiuso

## Il fatto, misurato in produzione (20/10/2026)

Con l'artefatto rigenerato (COLL 7.217, DIR 59.738) la regola del ticket **04** è viva: sul banco di prova
`applica_antimonopolio` mette **1** titolo per saga nei primi 20 slot (verificato su una collezione reale da
30 titoli). Ma nella riga **servita** da Stremio, `il_tuo_mondo`, ci sono **3 collezioni duplicate** nei
primi 20.

La causa: il **waterfall** (ticket 11/22) ripesca dal `_pool` quando una riga più specifica gli ha preso dei
titoli. Il `_pool` è `[20 già filtrati dai cap] + [coda con gli esclusi]`: appena il ripescaggio scende sotto
la posizione 20, rientrano i titoli che l'anti-monopolio aveva messo in coda — le saghe duplicate.

```
il_tuo_mondo: 20 titoli · in canone 20 · con saga 14 · collezioni duplicate 3
nicchia_di_qualita: 20 titoli · con saga 6 · collezioni duplicate 0
```

## Cosa deve uscire

1. **La diversità è una proprietà della riga SERVITA**, non della lista prima del waterfall: se il
   ripescaggio riempie i primi 20, i cap si applicano anche lì.
2. Il posto più semplice è `waterfall_righe`: mentre riempie una riga, tiene il conteggio per collezione e
   regista **dei primi `DIVERSITA_SLOT_MAX`** e salta chi viola il cap (lo mette dopo, o lo scarta e lo
   conta).
3. **Nessun titolo sparisce**: chi salta per il cap finisce dopo la posizione 20, come già fa
   `applica_antimonopolio`; e la riga dichiara se resta corta.
4. **La prova**: la stessa riga reale (o un fixture con 6 titoli della stessa saga) deve avere **1** titolo
   per saga e **2** per regista nei primi 20 **dopo** il waterfall, non solo prima; e con tutte le righe
   accese il comportamento deve restare quello del §9.1 + 04.
5. **Attenzione alla monotonicità**: la coda deve restare non crescente (`assert_monotonia_lista`), come
   già fa l'anti-monopolio.

## Note

- Non è un difetto del 04 né dell'11: è la loro **interazione**, e si vede solo adesso che entrambi hanno i
  dati per funzionare.
- Il conteggio dei duplicati per riga si può mettere nella sonda del 04, così la regressione si vede subito.
