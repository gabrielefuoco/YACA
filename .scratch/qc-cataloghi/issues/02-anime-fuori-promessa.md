# 02 — Anime fuori promessa nei cataloghi occidentali

**Stato**: `ready-for-agent` · **Causa**: C1 · **Fonte**: [report §3 C1](../ricerche/01-report-qc-cataloghi.md)

## Problema

15 cataloghi dichiarati non-anime servono anime tra i primi risultati. Nei due casi peggiori l'anime **è** la lista:
`preset_tv_high_fantasy` (78,6% anime: promessa «High Fantasy (Spade & Draghi)», verdetto **N 59**) e
`preset_cyberpunk_series` (58%, B 67). Il difetto nasce dall'assenza del filtro di esclusione animazione
(`without_keywords: '210024'`) o della whitelist di lingua originale (`with_original_language: 'en|it|es|fr|de|pt'`),
due strumenti già documentati nella skill `yaca-catalog-analyzer`.

## Cataloghi e misura (share anime nei primi 50/28)

| Catalogo | Anime | Verdetto | Trattamento richiesto |
|---|---|---|---|
| `preset_tv_high_fantasy` | 79% | N 59 | esclusione animazione + valutare la sostituzione della keyword |
| `preset_cyberpunk_series` | 58% | B 67 | esclusione animazione |
| `preset_asian_action` | 44% | B 71 | decisione di prodotto: se «Azione Asiatica» include l'animazione, dirlo nel nome; altrimenti escludere |
| `preset_cyberpunk` | 38% | B 72 | esclusione animazione |
| `preset_tv_superheroes_dark` | 23% | B 75 | esclusione animazione |
| `preset_extreme_survival` | 22% | B 77 | esclusione animazione |
| `preset_tv_politics` | 16% (8/50) | B 78 | esclusione animazione |
| `preset_tv_thriller` | 16% | P 85 | idem (il P non assolve il difetto) |
| `preset_time_travel_movies` | 16% | B 78 | idem |
| `preset_sad_romance` | 14% | P 86 | idem |
| `preset_zombies_movies` | 13% | N 59 | idem, insieme al ticket 04 |
| `preset_giant_monsters` | 12% | B 73 | esclusione animazione (o rinominare: kaiju è il genere vero) |
| `preset_netflix_movies` | 10% | P 89 | idem |
| `preset_martial_arts` | 10% | P 88 | idem |
| `preset_horror_all` | 4% ma 5 righe | B 79 | idem |

## Approccio

1. Per ogni catalogo non-anime: aggiungere l'esclusione animazione (`without_keywords: '210024'`) e, dove la promessa è occidentale, la whitelist `with_original_language`.
2. Non applicarla ai cataloghi `isAnime: true` né a quelli la cui promessa ammette l'animazione (deciderlo esplicitamente per `preset_asian_action` e `preset_giant_monsters`, che oggi sono ambigui).
3. Rigenerare i dump e ricontrollare la share anime: la soglia di accettazione è **< 5%** per i cataloghi non-anime.

## Criteri di accettazione

- Nei 15 cataloghi la share anime nei primi 50 scende sotto il 5%, salvo i due dichiarati.
- Nessun catalogo passa da P a B/N per effetto della correzione (misurare con `top50-dump.js` + rilettura a campione).
- I due N (`tv_high_fantasy`, `zombies_movies`) non sono più N.

## Fuori ambito

Il contenuto degli anime stessi, la loro qualità, la policy anime del profilo (`animePolicy`: già corretta, misurata al 100% nei hero di un profilo anime).
