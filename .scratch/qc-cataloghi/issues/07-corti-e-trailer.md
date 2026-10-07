# 07 — Corti, backstage e trailer serviti come film

**Stato**: `chiuso` 06/10/2026 · `F.minRuntime(60)` nei percorsi hero e di persona; 23 item sotto i 40' → 0 (commit `2b27480`)

## Problema

Nei percorsi che non hanno un vincolo di durata entrano, come fosse cinema, **cortometraggi, speciali backstage
e anteprime**. Nelle liste hero misurate: **23 item con durata sotto i 40 minuti**, di cui tre non-film evidenti
e due con durata `0` (metadato assente).

Esempi verificati:

| Item | Durata | Dove |
|---|---|---|
| Grand Theft Auto VI: Una lunga anteprima | 27' | `yaca_true_blend_movies` (generale e freddo) |
| Squid Game: dietro le quinte | 28' | `yaca_seed_network_movies` (freddo) |
| Once Upon a Studio | 9' | `yaca_seed_network_movies` (generale e freddo) |
| L'appuntamento di Carl | 8' | `yaca_hidden_gems_movies` (freddo) |
| La Dernière Patiente / Les Héros du Louvre | 0' | `yaca_trakt_filtered_movies` (freddo) |
| Il bambino, la talpa, la volpe e il cavallo | 35' | `yaca_seed_network_movies` (freddo) |

Il percorso `hidden_gems` **ha** il vincolo (`F.minRuntime(60)`) e infatti non serve i corti: il difetto è la sua
assenza negli altri percorsi (fallback popolare, seed network, trakt, e i preset che ordinano per popolarità).

## Approccio

1. Aggiungere `F.minRuntime(60)` ai film in tutti i percorsi che costruiscono liste (hero: fallback, seed network,
   trakt, true blend) — è già un filtro disponibile, non serve codice nuovo.
2. Escludere le durate `0`/nulle quando la durata è il criterio, e **non** escluderle quando non lo è (un film
   inedito con durata vuota è legittimo): la regola va scritta dove si applica.
3. Per i documentari e i contenuti brevi per natura (stand-up, speciali musicali), la durata minima non va applicata:
   vale solo per i cataloghi che promettono *film*.

## Criteri di accettazione

- Nei percorsi film, zero item sotto i 40 minuti, a eccezione dei cataloghi dichiaratamente di corti (nessuno oggi).
- Un secondo giro di `hero-enrich.js` mostra `durata ≥ 60` su tutti gli item movie dei hero, salvo quelli senza
  metadato (annotati, non nascosti).
- I pool non si svuotano: se l'aggiunta del vincolo lascia un hero sotto i 10 item, la regola di nascondimento
  esistente (`Fallback < 10 → metas: []`) deve scattare, non servire una lista corta.

## Fuori ambito

La qualità dei poster e delle card: qui si giudica se l'item è un film, non come viene disegnato.
