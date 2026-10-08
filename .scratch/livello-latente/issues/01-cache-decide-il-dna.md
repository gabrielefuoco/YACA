# 01 — La cache decide il DNA: misurare il non determinismo

**Status**: `resolved` 08/10/2026 · **Type**: `research` · **Aperto**: 08/10/2026

## Domanda

Quanto del `V_final` di un profilo dipende dallo **stato del processo** che lo costruisce, invece che dai segnali
dell'utente?

## Esito (08/10/2026) — chiuso

Difetto confermato e **corretto**. Numeri, fix e limiti della misura:
[`ricerche/01-misura-id-nome.md`](../ricerche/01-misura-id-nome.md). In sintesi:

- prima: `freddo` 0 chiavi gerarchiche, `caldo` 558; **metà del catalogo** diversa a parità di profilo (Jaccard
  top-50 = 50%, 48 posizioni su 50 cambiate);
- dopo: freddo e caldo **identici**, `Jaccard 100%`, 64 preset su 64; copertura keyword+gerarchia dal 6% al 91%;
- il fix: mappa id↔nome dal dump, chiavi di cache che descrivono la forma dell'input, `computeTopKeywords` che
  resta una lista di ID; test in `tests/dnaKeywordIdentity.test.js` (13 casi).

Il punto 4 del ticket (quanto è frequente la versione fredda in produzione) è **superato dai fatti**: non serve
sapere quanto spesso accadeva, ora non accade più. Ciò che resta da misurare è l'effetto *editoriale* del livello
acceso, ed è il [ticket 02](02-peso-livelli-alti.md).

L'ipotesi, dal fatto V4 della [mappa](../map.md): `HierarchicalGraph.vectorizeKeywords` cachea per `id:<numero>` sia
l'input oggetto `{id,name}` sia l'input numero. Chi passa il solo numero eredita nome e livelli gerarchici **solo se
quel numero è già stato visto con il nome nello stesso processo**. Verificato su un titolo: **14 chiavi a freddo,
74 a caldo**.

## Come si riproduce (già in repo)

```
node .scratch/livello-latente/runs/probe-cache.js freddo   # 14 chiavi, 0 livelli
node .scratch/livello-latente/runs/probe-cache.js caldo    # 74 chiavi, L1/L2/L3 popolati
```

## Misure richieste

1. **Su un profilo reale ricostruito a server freddo**: conteggio delle chiavi di `V_final` e `V_active` per
   prefisso (`g:`, `k:` numeriche, `k:` stringa, `o:`, `L1:`…`L5:`). Ripetere dopo un riavvio e dopo traffico:
   i due conteggi differiscono? Di quanto?
2. **Sul banco, non solo sul profilo**: sui profili simulati 0/50/100 della campagna hero, lo score di uno stesso
   item cambia fra processo freddo e caldo? Misura: Δ sullo `score` di `calculateItemMatch` per un campione di 100
   item, e quante posizioni cambiano nella top-50 di `true_blend` e `seed_network`.
3. **Superficie del difetto**: quanti percorsi di scrittura del DNA passano id numerici (`ProfileBuilder:157`,
   preset `with_keywords`, filtri DNA manuali) e quanti passano nomi (`query.keyword` di AI discovery e Kitsu).
   Elenco con `file:riga`.
4. **Quanto è «quasi sempre caldo» in produzione**: nei log o nella cache di un'istanza reale, quante delle keyword
   di un profilo nuovo sono già state viste con il nome prima della ricostruzione.

## Criteri di accettazione

- I numeri dei quattro punti, con il comando che li produce, riproducibile da chiunque.
- Il verdetto su una riga: il DNA è **deterministico** rispetto ai segnali dell'utente? Sì / No / Solo a cache calda.
- La lista dei percorsi che passano id e di quelli che passano nomi, con la riga di codice.
- Nessuna modifica a `src/`: si misura e si riferisce. Il riallaccio id→nome è un ticket successivo, con il numero
  davanti.

## Fuori ambito

- Il fix (passaggio esplicito id→nome e test a cache fredda): ticket successivo.
- La qualità dei cataloghi per catalogo (mappa `qc-cataloghi`).
- L'igiene del grafo (`r_4 = mazzaropi`, L1 singleton, `ui_name` mancante su L2/L5): terzo ticket.
- OCEAN e qualunque modello denso: si decide **dopo** questo numero.
