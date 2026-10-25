# Griglia boost/floor sul target Mercury — solo valutazione

**Nessun addestramento.** Il target standard (`mercury-target.npz`) è intatto.
Nuovi artefatti separati: `grid-target.pkl` / `grid-target.npz` (le 11 liste per 33 titoli), `grid-mercury.jsonl` (i verdetti).

## Disegno

- **Standard**: il mix del target attuale, pesato con le probabilità che Mercury ha dato ai pool (nessun boost). È l'artefatto che usiamo oggi.
- **10 varianti** `b<boost>-f<floor>`:
  - il **boost** governa la quota comportamento↔contenuto (b1 = 50/50, b1.5 = 60%, b2 = 67%, b3 = 75%);
  - il **floor** è la quota minima dei pool di comportamento (`graph`, `cov`, `combo`), che così entrano anche quando Mercury dava loro p≈0.
- Per ogni variante: top-10 contenuto ∪ top-10 comportamento (unione, non solo mix dei pool scelti), ordinati dallo score combinato.
- **Mercury decide**: per ogni titolo, 11 liste di vicini, `choice` su 11 criteri. 33 titoli giudicati.

> Nota di percorso: la prima versione della griglia era **degenere** (le 10 varianti identiche) per due bug: il boost veniva normalizzato via dentro il ramo comportamento, e il main riapplicava `argsort` sui 20 indici. Entrambi corretti prima di giudicare.

## Aggregato (probabilità media su 33 titoli)

| variante | media |
|---|---:|
| **STANDARD** | **0,593** |
| b1.5-f0.1 | 0,078 |
| b1.0-f0.0 | 0,074 |
| b1.5-f0.0 | 0,042 |
| b1.5-f0.2 | 0,042 |
| b2.0-f0.1 / b3.0-f0.1 | 0,036 |
| b3.0-f0.2 / b2.0-f0.0 | 0,031 |
| b2.0-f0.2 | 0,026 |
| b3.0-f0.0 | 0,012 |

Voti (argmax): **STANDARD 27/33**, b1.0-f0.0 3, b1.5-f0.1 3.
Film: 18/23 standard. Serie: 9/10 standard.

**Conclusione aggregata: il boost non è un miglioramento globale.** Mercury preferisce il mix standard in 4 casi su 5. Non c'è una variante da sostituire al target.

## Dove il boost vince (6/33) — e perché è interessante

| titolo | vince | standard | boost |
|---|---|---|---|
| Il ragazzo e l'airone | b1.0-f0.0 | Totoro + anime oscuri (Little Boy, The Tunnel to Summer…) | **Ghibli**: Howl, La città incantata, Mononoke, Totoro, Nausicaä |
| Il padrino | b1.0-f0.0 | trilogia + Quei bravi ragazzi + Scarface | Le ali della libertà, Pulp Fiction, Schindler's List, The Departed |
| Chernobyl | b1.5-f0.1 | documentari sullo stesso evento | Deepwater Horizon, Pandora, Volo 174, Challenger (catastrofi) |
| EEAAO | b1.5-f0.1 | Spider-Verse, Dune, Glass Onion + titoli oscuri | Interstellar, Dune, GotG3, Avatar 2, Puss in Boots 2, Barbie |
| Rosso, bianco & sangue blu | b1.5-f0.1 | film sui principi (Un principe per l'estate…) | commedie romantiche (Ti odio, anzi no…, Da me o da te) |
| La città incantata | b1.0-f0.0 | Ghibli (già buono) | Ghibli + Donnie Darko (leggermente peggio al netto) |

Il pattern è netto: **il boost vince quando lo standard è letterale** — stesso brand (Ghibli), stesso franchise (Padrino), stesso evento (Chernobyl), stesso titolo/bolla. Sono i casi in cui il contenuto «assorbe» il film e il comportamento porta il genere/il pubblico giusto.

## Dove il boost perde

- **Oppenheimer**: standard = i documentari sull'atomica (giusto). Boost = Top Gun, Glass Onion, Pinocchio, EEAAO → la **bolla 2022** (stessi spettatori, non simili). Qui il boost fa danni.
- **Squid Game**: standard = Alice in Borderland, The 8 Show, Darwin's Game (giusto). Boost = Choose or Die, Table No. 21, film oscuri sul gioco mortale. Il contenuto puro batte il comportamento.
- **Titanic / Alien**: entrambi buoni in tutte le varianti; il boost non aggiunge valore, cambia solo l'ordine.

## Copertura

33/40 titoli valutati. **7 film non sono nel canone**: Dune - Parte due, The Zone of Interest, Maestro, Priscilla, Napoleon, Wonka, Aquaman 2. È il ritardo noto del canone (non un problema del target).

## Verdetto operativo

1. **Target standard confermato come artefatto.** Il boost/floor non va applicato globalmente.
2. L'unico uso onesto del boost è **per-film**, come *gate*: usarlo solo quando il top contenuto è saturo di stesso-brand/stesso-evento/stessa-bolla. È una regola di prodotto, non un cambio di target — e i 6 casi qui sopra sono il seed per progettarla.
3. Niente riaddestramento finché non c'è una variante che batte lo standard, e oggi non c'è.
