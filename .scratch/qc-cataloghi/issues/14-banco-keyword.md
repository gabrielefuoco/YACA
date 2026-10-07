# 14 — Banco di prova keyword (includere ed escludere)

**Stato**: `chiuso` 06/10/2026 · `scripts/qa/keyword-bench.js` costruito e usato per tre giri di misure (commit `2b27480`)

## Problema

Dodici cataloghi affidano la promessa a **una** keyword TMDB (o a un'intersezione rigida di generi). La keyword non
controlla né il significato né l'estensione: o è troppo stretta (pool che non riempie la pagina) o troppo larga
(titoli che c'entrano per caso). Finora la scelta è stata fatta a intuito; serve un banco che la **misuri** prima di
scriverla, sia per le keyword da **includere** sia per quelle da **escludere**.

## Soluzione

Un CLI, `scripts/qa/keyword-bench.js`, che misura cosa porta un candidato (keyword o cluster del grafo) su un
catalogo, e un report che propone le liste per i cataloghi pilota con i numeri accanto.

### Come si misura (metodo congelato)

- **Etichette di verità**: i verdetti della campagna QC. Per un catalogo, i titoli della top-50 **non** citati in
  `errori` sono "in tema", quelli citati sono "fuori tema" (`.scratch/qc-cataloghi/review/preset/*.json`). È la
  ground truth disponibile e non richiede un nuovo giudizio manuale.
- **Recall**: quanti dei titoli "in tema" del campione il candidato raggiunge.
- **Precision**: quanti dei titoli che il candidato porta sono "fuori tema" secondo le etichette (o sconosciuti,
  perché fuori dal campione giudicato: si contano a parte).
- **Forma**: dimensione del pool, mediana voti, quota con genere 16 o lingua `ja` (per i cataloghi occidentali),
  overlap J@40 con i cataloghi fratelli.
- **Esclusioni**: per un candidato di esclusione, quanti titoli "in tema" si perdono (costo) contro quanti "fuori
  tema" si eliminano (beneficio).
- **Grafo**: invece di indovinare le keyword, si naviga `src/data/hierarchical_graph.json`
  (`kw_to_L1` → `L1` cluster con `medoid` e keyword → livelli superiori): si sceglie il **topos/cluster** che
  descrive la promessa e si propone la lista di keyword del cluster (o il suo medoid come ancora).

### Interfaccia

```
node scripts/qa/keyword-bench.js --preset preset_cult_classics            # misura la promessa attuale
node scripts/qa/keyword-bench.js --preset preset_cult_classics --include 6158,9748 --exclude 210024
node scripts/qa/keyword-bench.js --preset preset_fantasy_magic --cluster "sword and sorcery"   # propone dal grafo
node scripts/qa/keyword-bench.js --pilot                                    # giro completo sui cataloghi pilota
node scripts/qa/keyword-bench.js --pilot --json --out <file>                # tabella macchina
```

Output leggibile: una tabella per catalogo con promessa attuale, alternative provate, recall/precision/pool e la
proposta.

### Cataloghi pilota (dalla campagna)

`preset_cult_classics` (B 64) · `preset_zombies_movies` (N 59) · `preset_psych_thriller` (B 68) ·
`preset_italian_comedy` (B 68) · `preset_mindfuck` (B 75) · `preset_mindfuck_series` (B 71) ·
`preset_fantasy_magic` (B 72) · `preset_space_hard_scifi` (B 73) · `preset_action_blockbusters` (B 74) ·
`preset_anime_shonen` (B 76) · `preset_heist` (B 77) · `preset_treasure_hunters` (B 77).

## Criteri di accettazione

- Lo script gira sui 12 cataloghi pilota e produce la tabella; `--json` emette una struttura stabile.
- Per ogni pilota il report propone: lista di inclusione (5-15 keyword o un cluster), lista di esclusione, e i
  numeri misurati (recall, precision, pool) accanto a ciascuna alternativa.
- Il report distingue i casi in cui **non** esiste una keyword migliore e la soluzione è cambiare il nome del
  catalogo (rinvio al ticket 08).
- Nessuna modifica ai preset in questo ticket: il banco **propone**, le modifiche sono un ticket successivo
  (per non avere due scrittori su `presets.js`).

## Fuori ambito

- L'editing di `src/data/presets.js` (ticket successivo).
- La qualità editoriale dei titoli (già giudicata dalla campagna).
