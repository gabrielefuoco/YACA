# 08 — Nome e filtro che non dicono la stessa cosa

**Stato**: `chiuso` 07/10/2026 · 5 cataloghi decisi con l'utente: 2 rinominati, 1 filtrato, 1 accettato, 1 nuovo catalogo 0-3 (`5e9d0d5`)

## Problema

Cinque cataloghi sono internamente coerenti ma **mentono nel nome**: il filtro è uno, la promessa del titolo
un'altra. È il difetto più economico da correggere e quello che l'utente nota per primo, perché non richiede di
guardare i dati: basta leggere il catalogo.

| Catalogo | Score | La contraddizione |
|---|---|---|
| `preset_animal_protagonists` | B 68 | «Animali Protagonisti» con protagonisti umani (Mario, Pinocchio, Thumbelina) e **un horror** (`Le streghe`) in un catalogo per bambini |
| `preset_teen_preteen_tv` | B 79 | target teen, dentro Teletubbies, Barney, Sesamo apriti!, The Wiggles (filtro genere Kids senza fascia d'età) |
| `preset_disney_animation` | B 79 | «Disney Classici & Animazione» metà Pixar (company id generico), pool 50 |
| `preset_giant_monsters` | B 73 | «Squali & Mostri Giganti» per metà kaiju giapponese (50% lingua ja) |
| `preset_action_blockbusters` | B 74 | «Azione, Motori & Esplosioni» ma la lista è action generico (Spider-Man, Aquaman, Hunger Games) |

## Approccio

Per ciascuno, una scelta esplicita fra due strade — entrambe valide, purché il nome e il filtro coincidano:

1. **Correggere il filtro** per realizzare la promessa: escludere Horror da `animal_protagonists` (obbligatorio:
   è un catalogo per bambini), distinguere la fascia prescolare da quella teen, restringere alla libreria
   d'animazione classica, togliere il kaiju o nominarlo, sostituire la keyword «motori» con qualcosa che la realizzi.
2. **Correggere il nome** quando il contenuto è buono e la promessa era solo mal scritta.

Il caso `preset_animal_protagonists` è l'unico con una **componente di rischio** (un horror in un catalogo
bambini): va corretto per primo, indipendentemente dalla decisione sul resto.

## Criteri di accettazione

- Per ogni catalogo: o il filtro realizza il nome, o il nome dice cosa fa il filtro. La scelta è scritta nel ticket.
- `preset_animal_protagonists`: zero titoli con genere Horror e zero protagonisti non-animali nei primi 50.
- `preset_teen_preteen_tv`: zero titoli prescolari nei primi 50.
