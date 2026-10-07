# 05 — Soglie di voto e anti-trash

**Stato**: `ready-for-agent` · **Causa**: C4 + C7 · **Fonte**: [report §3 C4 e C7](../ricerche/01-report-qc-cataloghi.md)

## Problema

Due facce della stessa leva (le soglie sui voti):

1. **Trash nelle nicchie** (177 righe su 582): dove il genere è povero di per sé, le soglie attuali non bastano e
   il catalogo serve B-movie e derivati. I peggiori: `preset_bollywood` 8 righe · `preset_italian_comedy` 8 ·
   `preset_cult_classics` 6 · `preset_a24_horror` 6 · `preset_slapstick_comedy` 5 · `preset_tv_dystopia` 5 ·
   `preset_spy_action` 5 · `preset_nicolas_cage` 4 · `preset_medical_drama` 4 · `preset_stand_up` 4 ·
   `preset_disney_plus` 4 · `preset_fairy_tales` 4 · `preset_fantasy_magic` 4 · `preset_hbo_max_movies` 4 ·
   `preset_actor_reeves` 4. Casi-limite dichiarati dai giudici: `A Serbian Film` in `preset_slasher_gore`,
   `Scary Movie 5` in `preset_slapstick_comedy`, `Morbius` e `Blade: Trinity` in `preset_vampires_werewolves`.
2. **Metadati sottili**: 23 cataloghi hanno oltre il 30% dei primi 50 titoli **sotto 50 voti** — con l'ordinamento
   per voto medio questo significa classifiche fragili. Peggiori: `preset_new_series_eps` 88% ·
   `preset_doc_food_travel` 82% · `preset_donghua` 74% · `preset_sports_docs` 72% · `preset_doc_history_war` 72% ·
   `preset_sea_series_docs` 69%.

## Approccio

1. Alzare `vote_count.gte` dove è sotto 50 (molti preset partono da 5-20 voti: sono nati per «non essere vuoti» e
   oggi sono la causa del rumore).
2. Nelle nicchie, aggiungere una **soglia di voto minima più alta della soglia di esistenza** (es. horror/slasher:
   500 voti per i film, 100 per le serie) e una blacklist di titoli curata, non un filtro automatico.
3. Per i documentari/novità: accettare i pochi voti (è la natura del contenuto) ma **dichiarare** che l'ordinamento
   non è per voto: usare popolarità o data quando la mediana dei voti è sotto 100.

## Criteri di accettazione

- Righe di `trash` nei cataloghi elencati ≤ 1.
- Nei 23 cataloghi, la quota di titoli sotto 50 voti scende sotto il 30% **oppure** l'ordinamento dichiarato cambia
  (da voto medio a popolarità/data), che è l'altra soluzione legittima.
- Nessun catalogo perde più di 10 punti di pool per effetto delle soglie alzate (bilanciare col ticket 04).

## Fuori ambito

La qualità percepita dei titoli che restano: il giudizio editoriale si rifà con la campagna (ticket 12), non qui.
