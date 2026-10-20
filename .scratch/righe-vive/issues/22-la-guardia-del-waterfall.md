Status: ready-for-agent
Type: task
Blocked by: 11

# 22 — La guardia del waterfall: deduplica solo fra le righe che qualcuno mostra

## Il fatto (riapertura del ticket 11)

Il waterfall del ticket 11 è **fedele al §9.1**: ogni titolo va alla riga più **specifica** che lo
contiene. Sul fixture, però, `il_tuo_mondo` perde **59/60** titoli (tutta la top-10) verso
`micro_cluster_1`, che nessun catalogo Stremio mostrava prima del ticket 13 — e anche dopo il 13 un
micro-cluster può essere **spento** nel profilo. Risultato: la deduplica toglie titoli a righe visibili per
riempire righe invisibili.

## Decisione (20/10/2026)

**Guardia**: la deduplica considera solo i ruoli che **hanno un catalogo servito** per quel profilo/media.
Le righe non servite non partecipano al waterfall (non rubano titoli), e questo si dichiara nel payload
(`doppioni_tolti` resta la copia evitata; si aggiunge chi non ha partecipato).

## Cosa deve uscire

1. **Il set dei ruoli partecipanti** è un ingresso esplicito del waterfall (dal registro + selezione del
   profilo), non una costante: se domani un ruolo diventa un catalogo, partecipa senza toccare il motore.
2. **Nessuna riga sparisce** e nessuna riga servita resta vuota *per colpa della deduplica*: se una riga
   perde titoli verso righe non servite, il waterfall non deve averglieli tolti.
3. **La misura**: sul fixture del 11, `il_tuo_mondo` deve tenere la sua top-10 quando i micro-cluster non
   sono serviti, e tornare a perdere 59/60 quando lo sono (la specificità resta quella).
4. **Nessuna regressione sul §9.1** quando **tutte** le righe sono servite: stessi conteggi del ticket 11.

## Note

- Il ticket 11 resta `resolved`: questo è il suo seguito in produzione, non una correzione dell'algoritmo.
- Il caso «riga servita ma spenta nel profilo» è il più frequente prima del 20: la guardia deve guardare la
  **selezione**, non il registro.
