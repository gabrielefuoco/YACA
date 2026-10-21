Status: resolved
Type: task

# 02 — Il badge «ultimo episodio» non si sceglie più nel Creatore

## Perché

Nel Creatore c'era uno switch «Mostra Ultimo Episodio» (solo per le serie) che finiva nel catalogo
come `showEpisodeBadge`. Non è una preferenza dell'utente: il badge è una proprietà dei cataloghi che
esistono per mostrare gli episodi nuovi.

## Cosa è stato fatto

- Rimossa la riga 4 del Creatore (`Badge Episodi` + tooltip + switch), lo stato `showEpisodeBadge` e
  il campo dal payload: i cataloghi creati a mano non lo mandano più (default del backend: spento).
- **Non** toccati i preset: `preset_new_series_eps` e `preset_anime_simulcast` hanno
  `showEpisodeBadge: true` nel loro definition, e `EPISODE_CATALOG_IDS` lo forza per certi cataloghi
  (`src/stremio/badges.js:107`). Continuano a mostrarlo, com'è giusto.

## Verifica (21/10)

Harness a 390px sulla tab Creatore: nessuna occorrenza di «Badge Episodi» né di «Ultimo Episodio»,
`#badge-toggle` assente. Build e `tsc` verdi.
