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

## Esito (07/10/2026) — il percorso vero funziona

Misurato in sola lettura sul profilo **attivo** dell'account reale (`REOZrGNRr3`, context `1c1da0af` «Otaku Hardcore»).
Report completo: [`ricerche/03-trakt-reale.md`](../ricerche/03-trakt-reale.md).

**Il percorso autenticato gira davvero**: nei log `traktAvailable=true`, `fallbackUsed=false`, e nessuna riga
`Degrado Trakt confermato`. Con questo, la lacuna dichiarata dalla campagna è chiusa: il degrado misurato nei test era
**dei profili senza token**, non del prodotto.

| | Campagna (percorso degradato) | Percorso reale |
|---|---|---|
| `yaca_trakt_filtered_movies` | B 63-67 · mediana 6,7 · anno 2026 · 14 item live-action su 20 | **P 88** · mediana 7,4 · anno 2012 · 39 item, 100% anime |
| `yaca_trakt_filtered_series` | B 68-78 | **P 86** · mediana 7,9 · 8 item, 100% anime |

**Zero titoli sovrapposti** con gli altri tre hero (film e serie): l'invariante di disgiunzione regge sul percorso vero.

### Due cose che la misura ha rivelato, e che il flag non dice

1. **La lista film non è Trakt, è il top-up interno.** Trakt ha risposto con raccomandazioni cinematografiche generiche,
   e il filtro `animePolicy: ONLY` del profilo le ha scartate tutte (`Trakt Filtered Anime top-up per movie: trovati solo
   0 item`): gli item serviti vengono dal fallback anime interno, che per progetto **non** alza `fallbackUsed`
   (altrimenti il catalogo si azzererebbe). Quindi `fallbackUsed=false` significa «non ho degradato per errore», **non**
   «Trakt ha contribuito». Un flag che non distingue le due cose è un flag da rivedere.
2. **La lista serie ha 8 titoli** (pagina corta): il pool viene prosciugato dall'assegnazione disgiunta degli altri hero,
   che scelgono prima. È materiale del ticket 09 (hero) e del 04 (pool), non di questo.

**Punto cieco dichiarato**: misurato solo il profilo attivo. Gli altri quattro (`global`, `4159713d`, `0465f104`,
`3f2f4afd`) richiederebbero di cambiare `activeProfileId` sulla configurazione reale — una scrittura sul profilo
dell'utente, che cambierebbe ciò che vede in Stremio fino al ripristino. Non si fa: la lacuna resta scritta, e il
meccanismo (raccomandazioni filtrate dalla policy + top-up) è ormai noto.
