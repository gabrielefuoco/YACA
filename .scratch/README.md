# `.scratch/` — la memoria del lavoro

**Questa cartella è versionata.** Ci vivono gli artefatti di *come* si è arrivati al codice: le mappe di
wayfinding, i ticket, i report di analisi, gli script di verifica. Non sono il prodotto — sono il percorso,
e servono a chi riprende un fronte mesi dopo per sapere perché una cosa è fatta così e cosa è stato scartato.

## La struttura

```
.scratch/<effort>/
  map.md              la mappa: destinazione, note, decisioni prese, nebbia, fuori ambito
  issues/NN-slug.md   i ticket, uno per file (NN da 01)
  ricerche/NN-slug.md i report di analisi, con path:riga e misure riproducibili
  research/           analisi lunghe, quando servono
```

Le convenzioni operative complete stanno in [`docs/INDEX.md`](../docs/INDEX.md) (sezione sulle mappe e
sulla marcatura delle decisioni superate).

## Cosa NON sta qui

Git esclude i derivati e i dati pesanti, che si rigenerano e non vanno versionati: `*.parquet`,
`*.json.gz`, `*.ndjson`, `node_modules/`, `venv/`, `runs/`, `data/`. Vedi le regole in
[`.gitignore`](../.gitignore).

## Perché è versionata

Il 06/10/2026 questa cartella è stata **cancellata per errore** — un `rm -rf` su un worktree che conteneva
junction verso il checkout principale — e con lei nove mappe storiche, trentadue ticket e diciassette report.
Era in `.gitignore`: non esisteva alcuna copia. I report sono stati ricostruiti in parte dai transcript degli
agenti, il resto è perso.

La lezione: **il percorso vale quanto il prodotto**, e ciò che non è versionato non esiste. Da allora
`.scratch/` è tracciata.

> **Attenzione ai worktree.** Se crei un worktree e ci colleghi questa cartella (o `node_modules`) con una
> **junction** o un symlink, non cancellarlo mai con uno strumento ricorsivo standard: `rm -rf`, `rimraf` e
> `fs.rmSync(..., {recursive: true})` **seguono i link** e distruggono la destinazione. Smonta prima i
> collegamenti (`rmdir` sul percorso del link), poi rimuovi l'albero.
