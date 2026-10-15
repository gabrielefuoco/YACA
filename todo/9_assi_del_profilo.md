# Obiettivo: gli assi del profilo — due slider in creazione, il resto dedotto

Idea dell'umano (15/10/2026), registrata qui perché è una **decisione presa** dentro il cantiere del
grafo, ma il consumatore che la giustifica (il modello del profilo che sceglie la query) non esiste
ancora. Contesto: `.scratch/modulo/handoff-senior-5.md` e le misure di `graph/measure/diffusione.py`.

## La decisione

Il tipo del profilo ha **cinque assi** (alla OCEAN), e il segnale viene da due fonti **combinate**:

1. **Un onboarding minimo** — un paio di slider al momento della creazione del profilo. È
   **informazione nuova**: l'utente dice una cosa che nessun dato possiede.
2. **La deduzione dalla cronologia di visione** — il resto, dagli assi che si leggono nei fatti.

E il tipo **decide la query al grafo**: quante liste mostrare, quanto lontane, quanto in profondità.

## Cosa c'è oggi, e cosa manca

La creazione del profilo oggi è: **scelta di un preset** (`Generale`, `Solo Film`, `Solo Serie`,
`🎌 Otaku Hardcore`, `🎮 Cultura Nerd & Sci-Fi`, `💕 Serata di Coppia`, `💥 Adrenalina & Popcorn`…)
più i semi, e i `typeSelectors`. **Nessun campo psicologico.** Lo schema è `src/models/TasteProfile.js`.

C'è però già `flatnessMetrics` con `entropyBits`: **una misura di forma ha già una casa nel modello**,
e la forma è uno degli assi che il grafo sa produrre da solo (§sotto). Va riusata, non reinventata.

## Quello che il grafo sa già dire da solo — e quindi NON va chiesto all'utente

Misurato il 15/10/2026 su **12 utenti MovieLens veri** con almeno 100 film
(`graph/measure/diffusione.py`), stabilità fra **due metà della stessa storia**:

| asse | cos'è | spread fra utenti | stabilità (Spearman) |
|---|---|---|---|
| **canone** | mediana dei voti TMDB della storia | **4,8×** (2.682 → 12.923 voti) | **0,87** |
| **forma** | quanti mondi contengono ≥ 2% della storia | **2,8×** (4 → 11) | **0,82** |
| entropia | concentrazione dei mondi | 1,2× | 0,89 |
| testa | quota del mondo più grande | 3,6× | 0,48 |

Due avvertenze scritte perché servono:

- **L'entropia è stabile e inutile**: 2,8% di differenza fra due metà, ma 1,2× di spread fra utenti.
  Stabile non basta: un asse deve anche **distinguere**.
- **La concentrazione della testa è instabile** (0,48) perché il vertice della classifica dei mondi è
  piatto: due metà della stessa storia si accordano solo al 25%. Non usarne la cima per decidere.

Quindi gli slider **non devono coprire canone e forma**: li deduce la cronologia, e li deduce bene.
Devono coprire **ciò che i fatti non dicono** — perché si guarda una cosa, e cosa si vuole stasera.

## L'avvertimento del prototipo OCEAN, che vale ancora

`.scratch/ocean-prototipo/` (08/10/2026, quattro test, tutti riproducibili) ha misurato che **un OCEAN
usato come spazio di similarità è smentito**: cinque dimensioni e tutto assomiglia a tutto — coseno
medio **0,63** contro **0,03** dello sparso, e da *Mad Max* si arriva a *Sister Act*. Come
**descrizione** invece funziona: faccia valida al 100% (2001 → O 0,71; Hereditary → N 0,83 e A −0,50).

**Conseguenza per questi cinque assi: servono a INSTradare, non a ordinare i titoli.** Se qualcuno
provasse a usarli come vettore per l'ordinamento, rifarebbe un test già fatto e già perso.

## Cosa non è deciso

- **quali slider**, e quanti. Il vincolo dichiarato è «giusto un paio di accorgimenti, non
  grossissimi»: vanno scelti per **instradare**, non per descrivere l'utente.
- **come si combinano** dichiarato e dedotto, e cosa succede quando si contraddicono: se l'utente si
  dichiara esploratore e guarda solo saghe, chi vince.
- **quando** si aggiorna il dedotto (a ogni sync? ogni notte?) e se l'utente può vedere/correggere il
  proprio tipo.
- **come si verifica** che il tipo serva davvero: serve un banco che mostri che due tipi diversi, con
  la stessa storia, producono portafogli diversi *e migliori* per quell'utente.

## Dove finisce, e cosa NON fare qui

Il frontend della creazione del profilo va rivisto (**slider in creazione**), ma **non in questo
cantiere**: il modello che li consuma non esiste ancora, e chiedere all'utente qualcosa prima di
potergliene restituire il valore è il modo di far odiare l'onboarding. Prima il cantiere del grafo
consegna la query che funziona senza tipo; poi il tipo entra come regola di scelta **dentro** un
insieme ammesso già funzionante.
