# 10 — Hero `trakt_filtered`: percorso reale mai misurato

**Stato**: `ready-for-agent` · **Causa**: dai giudizi hero (fallback Trakt) · **Fonte**: [report §6.3](../ricerche/01-report-qc-cataloghi.md)

## Problema

Il hero «🌐 Suggeriti dalla Community» è, in ogni profilo giudicato, **il percorso degradato**: mediana di voto la
più bassa di tutti gli hero (6,6-6,7), anno mediano 2026, titoli con 10-20 voti e durate a 0. I giudici lo hanno
bocciato con motivazioni convergenti (B 63-78 in quattro profili).

La causa è nota e **non è un difetto**: l'account di test non ha token Trakt, quindi il builder cade sul fallback.
Il problema è che questo è **l'unico percorso mai osservato**, mentre l'account reale (`REOZrGNRr3`) ha
`apiKeys.trakt` e quindi in produzione segue un percorso diverso, mai misurato da nessuno.

## Approccio

1. **Misurare il percorso vero**: o copiando il token Trakt nel profilo di test (l'harness oggi lo evita di
   proposito per prudenza), o facendo un fetch read-only sui hero del profilo reale e giudicando quelli.
2. **Gestire il caso senza token in modo dichiarato**: se non c'è token, il hero non deve essere «Suggeriti dalla
   Community» (che promette una cosa che non può mantenere) — o si nasconde, o si chiama diversamente.
3. Verificare la regola di nascondimento già presente (`fallback < 10 item → metas: []`) sul percorso degradato.

## Criteri di accettazione

- Almeno un profilo con il percorso Trakt reale giudicato con la stessa rubrica (8 hero: 4 movie + 4 serie).
- Nessun utente senza token riceve un catalogo intitolato a una community che non ha contribuito.
- Il confronto fallback ↔ percorso reale è nel report (differenza di mediana di voto, anno, quota ITA).

## Fuori ambito

Il funzionamento dell'API Trakt e il device flow di autenticazione (già coperti da `docs/INTEGRATIONS.md`).
