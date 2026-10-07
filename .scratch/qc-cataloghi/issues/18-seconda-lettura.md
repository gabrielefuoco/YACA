# 18 — Seconda lettura: i cataloghi bonificati sono anche migliori?

**Stato**: `ready-for-agent` (serve la quota agy dei giudici) · **Causa**: metodo della campagna (seguito del ticket 12) · **Fonte**: [report](../ricerche/01-report-qc-cataloghi.md) §10

## Problema

I punteggi della campagna sono **snapshot del 06/10**. Dopo quella misura, ~40 cataloghi sono cambiati:
15 esclusioni anime (02), 11 cataloghi di persona (06), 12 rifatti col banco keyword (17) e i suoi 5 del secondo
giro. I numeri misurati dicono che i **conteggi** sono migliorati (fuori tema 10-40% → 0-4%, pool corti riempiti), ma
nessuno ha riletto i titoli: non sappiamo se il catalogo, oltre a essere più pulito, è anche **più bello** — o se
l'abbiamo solo reso più stretto.

E c'è un secondo motivo, che è di metodo: la seconda lettura è anche l'occasione per **misurare il rumore del giudice**
sulla rubrica corretta, dopo che la prima tornata ha mostrato Δ fino a 34 punti.

## Soluzione

Una tornata di rilettura su un campione, con la rubrica v2 e doppio giudice.

### Rubrica v2 — cosa cambia rispetto alla prima

1. **Due letture separate della pertinenza**, perché è lì che i giudici divergevano:
   - *aderenza ai filtri dichiarati* (verificabile a macchina: i titoli rispettano i filtri del preset?);
   - *aderenza alla promessa del nome* (giudizio: chi legge il nome si aspetta questi titoli?).
   Le due si annotano separate; il punteggio di pertinenza è la **media pesata** (filtri 40%, nome 60%), e la
   divergenza tra le due è materiale del report, non un errore.
2. **Doppio giudice obbligatorio** su N e B (o su qualunque punteggio entro ±5 dalla soglia), con adjudication
   dell'orchestratore registrata in `review/correzioni.json` come nella prima tornata.
3. **Bande, non misure**: differenze sotto i 10 punti non sono un fatto; il report le presenta come «stessa banda».
4. **Cap degli errori**: dove il difetto è sistematico, il giudice annota «N+ e il difetto è diffuso» con la quota
   stimata, invece di fermarsi a 8 righe.

### Campione (≈21 cataloghi, 2 lotti)

- **I 12 del ticket 17** (dove i filtri sono cambiati di più): `cult_classics`, `zombies_movies`, `psych_thriller`,
  `italian_comedy`, `mindfuck`, `mindfuck_series`, `fantasy_magic`, `space_hard_scifi`, `action_blockbusters`,
  `anime_shonen`, `heist`, `treasure_hunters`.
- **Le due eccezioni dichiarate**: `mindfuck_series` (11% fuori tema) ed `extreme_survival` (6%) — è qui che serve il
  giudizio umano, perché i conteggi non bastano più.
- **I 5 del secondo giro**: `tv_high_fantasy` (7 → 62 titoli: cambiato *tutto*), `cyberpunk_series`, `cyberpunk`,
  `time_travel_movies`, `tv_superheroes_dark` (quest'ultimo **non** toccato: è il controllo).
- **Controllo di rumore**: 2 cataloghi **mai toccati** da nessun ticket — `preset_pop_movies` (P 96 nello snapshot)
  e `preset_hbo` (P 94) — ri-giudicati alla cieca per misurare il Δ del giudice sulla rubrica v2.

### Metodo operativo

- Dump aggiornato con `node scripts/qa/top50-dump.js --only <ids> --out .scratch/qc-cataloghi/runs/top50-18`.
- Un foglio per lotto (le stesse tabelle della prima tornata: posizione, titolo, anno, voto, voti, generi, lingua).
- Verdetti nel formato già usato (`review/preset/*.json`), in **file nuovi** per non sovrascrivere la prima lettura:
  `review/preset-seconda/*.json`.
- Istruzioni ai giudici: leggere la promessa **attuale** (che nei due rinominati è cambiata) e giudicare contro quella;
  mai confrontare con la prima lettura (è un ri-giudizio, non una caccia alle differenze).

## Criteri di accettazione

- Copertura: 21/21 cataloghi ri-giudicati, con schema completo (le 5 dimensioni, verdetto, evidenza, fiducia).
- **Rumore misurato**: sui 2 cataloghi di controllo il Δ rispetto alla prima lettura è **≤ 10 punti** e il verdetto non
  cambia. Se peggiora, la rubrica v2 non è pronta: si annota e non si pubblica il confronto.
- **Confronto pubblicato** con le dovute cautele: per ogni catalogo, punteggio prima/dopo, banda, e una riga che dice se
  il cambiamento è *nei titoli* (bonifica) o *nel giudizio* (rumore). Dove il dopo è peggiore, si dice: la bonifica può
  aver stretto troppo.
- La sezione §10 del report si aggiorna con l'esito (o si aggiunge §11 «Seconda lettura»).

## Fuori ambito

- I cataloghi non toccati (restano validi i verdetti del 06/10).
- Gli hero: il confronto lì richiederebbe un nuovo fetch (e il percorso Trakt reale è del ticket 10).
- Correzioni ulteriori: quello che emerge qui diventa ticket nuovi, non patch in questa tornata.
