# 06 — Cataloghi di persona: documentari, corti e cameo

**Stato**: `chiuso` 06/10/2026 · documentari fuori e durata minima 60' (commit `2b27480`)

## Problema

Nei cataloghi di regista o attore il filtro è «ha lavorato a questo titolo», non «è un titolo con quella persona
come protagonista o autore». Il risultato è che nelle liste entrano **documentari su di lui**, cortometraggi,
speciali TV, film TV e partecipazioni minori. È un difetto a bassa gravità e ad alta frequenza: 11 cataloghi,
1-4 righe ciascuno, raramente abbastanza da cambiare il verdetto — ma è la prima cosa che un utente nota in un
catalogo intitolato a una persona.

## Righe verificate

| Catalogo | Score | Esempi citati |
|---|---|---|
| `preset_actor_cruise` | B 79 | The Final - Attacco a Wembley, Val, Stanley Kubrick - Ein Leben für den Film |
| `preset_actor_reeves` | P 82 | Animatrix, Siberia, Nell'ombra di un delitto |
| `preset_nicolas_cage` | P 85 | Left Behind, Il prescelto, Ghost Rider - Spirito di vendetta, Outcast |
| `preset_actor_dicaprio` | P 88 | Spielberg (documentario), Critters 3 |
| `preset_de_niro` | P 84 | Val, Sly (documentari) |
| `preset_kubrick` | P 87 | The Seafarers, Il padre volante (documentari) |
| `preset_johnny_depp` | P 89 | London Fields, Nightmare 6 |
| `preset_tarantino` | P 88 | Reservoir Dogs (assente dall'ordinamento), Kill Bill: The Whole Bloody Affair |
| `preset_lynch` | P 87 | The Amputee (cortometraggio) |
| `preset_wesanderson` | P 87 | La meravigliosa storia di Henry Sugar (corto) |
| `preset_scott` | P 86 | The Counselor |

## Approccio

1. Escludere il genere Documentario (`without_genres: 99`) dai cataloghi di persona, salvo eccezione dichiarata.
2. Aggiungere una **durata minima** per i film (≥ 60', vedi ticket 07) per tagliare corti, teaser e speciali.
3. Distinguere «regia» da «recitazione»: il filtro già distingue `with_crew` da `with_cast`, ma per gli attori va
   valutato un ruolo principale (TMDB non lo espone: la strada praticabile è una blacklist curata dei documentari
   e delle partecipazioni, non un filtro automatico).

## Criteri di accettazione

- Nei cataloghi elencati le righe di errore scendono a ≤ 1.
- I pool restano sopra la soglia del ticket 04 (escludere documentari non deve svuotare i cataloghi piccoli: se
  succede, il catalogo era composto in prevalenza da quelle righe).

## Fuori ambito

L'aggiunta di dati di ruolo principale a TMDB (non dipende da noi).
