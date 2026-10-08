# 02 — Il tono connette ma non conta: il peso dei livelli alti

**Status**: `ready-for-agent` · **Type**: `research` · **Aperto**: 08/10/2026 · **Blocked by**: nessuno
(ticket 01 chiuso: la gerarchia ora arriva al DNA in modo deterministico)

## Domanda

Quanto vale, nella classifica servita, il livello **alto** della gerarchia (L3 macro-vibe, L4 macro-genere,
L5 radice) — e quanto dovrebbe valere?

Dal [report 01](../ricerche/01-misura-id-nome.md): dopo il fix la gerarchia si connette per il **91%** degli item,
ma la quota del punteggio tematico attribuibile a keyword+gerarchia ha mediana **0,1%**. Il motivo è nei pesi fissi
della vettorizzazione ([`HierarchicalGraph.vectorizeKeywords`](../../../src/engines/graph/HierarchicalGraph.js)):

```
k:<keyword> 1.0 · L1 1.0 · L2 0.5 · L3 0.1 · L4 0.05 · L5 0.01
```

Un item che condivide con il profilo il *tono* ma non la keyword non riceve praticamente nulla: il livello
«comfort vs sfida», «spazio e destino», «dipendenza e conflitti» esiste, è già calcolato, ed è **muto**.

## Perché conta

L'utente ha descritto tre dolori: assi senza nome, **classifica piatta** (nessun tono), profili nuovi inutili.
Il terzo è stato misurato e corretto (ticket 01). Il secondo ha qui il suo candidato più economico — e va misurato
**prima** di valutare un modello denso nuovo (OCEAN o embedding item-side): la gerarchia è già calcolata, OCEAN
andrebbe annotato su tutto il catalogo.

## Misure richieste

1. **Sensibilità al peso.** Alzare i pesi dei livelli alti (candidati: L3 0.1 → 0.25/0.4, L4 0.05 → 0.15/0.25,
   L5 0.01 → 0.05) e misurare, sullo stesso banco del ticket 01 (64 preset × 400 item, `measure.js`):
   quota del punteggio tematico attribuibile alla gerarchia, item con match, **Jaccard della top-50** rispetto
   al peso attuale.
2. **Discriminazione, non solo copertura**: se *tutti* gli item ottengono un contributo alto, il segnale non
   distingue più nulla. Misura da produrre: distribuzione della quota, e quanti item cambiano posizione nella
   top-50 (una lista che si rimescola tutta è peggio di una piatta).
3. **Verifica editoriale vera** (l'unica che conta): la top-50 dei preset più sensibili al tono — `Stand-Up
   Comedy`, `Sketch Comedy`, `Miniserie di Qualità`, `Anime: Shōjo` (quelli con sovrapposizione 4-28% dopo il
   fix) — giudicata con la rubrica della campagna `qc-cataloghi` prima e dopo il cambio di pesi.
4. **Igiene necessaria perché la misura significhi qualcosa**: la radice `r_4 = "mazzaropi"` (nodo con una sola
   keyword) e i 4 L1 con una sola keyword vanno esclusi o corretti — un nodo spazzatura pesato più forte è un
   difetto amplificato.

## Criteri di accettazione

- Tabella dei pesi provati con, per ciascuno: quota gerarchia, item con match, Jaccard top-50 vs oggi, numero di
  preset con lista identica.
- Un verdetto motivato su **un** set di pesi, con il numero che lo sostiene e l'elenco di ciò che peggiora.
- Il giudizio manuale sui 4 preset sensibili, con la rubrica standard (pertinenza 35, qualità 20, distintività 15,
  coerenza 15, completezza 15) e il Δ rispetto a oggi.
- Nessuna modifica a `src/` prima del verdetto: si misura e si propone.

## Fuori ambito

- OCEAN e qualunque modello denso nuovo: si decidono dopo, con questo numero in mano.
- Il pool e la selezione dei candidati (top-3 generi + cluster): è la prossima mappa, se questa non basta.
- `ui_name`/`ui_emoji` come racconto del profilo (dolore «assi senza nome»): presentazione, non ranking.
