# Ticket 02 — la collocazione di un titolo nuovo

Script: `02-collocazione.py`. Due prove, e il contrasto fra le due è il risultato.

## Parte A — 1.500 titoli con la risposta giusta: la proiezione **non** riproduce lo spazio del comportamento

1.500 titoli **che sono nel grafo**, comportamento nascosto, **modello riaddestrato senza di loro** (la Ridge ha 128 × 7.934 = 1 milione di parametri su 49.041 titoli: col modello che li ha visti, un test di inserimento non misura niente). Poi si confrontano i vicini trovati con i vicini **veri**, quelli dello spazio CF.

| | |
|---|---|
| vicini in comune sui primi 10 | **0,0%** (caso: 0,015%) |
| vicini in comune sui primi 50 | **0,1%** (caso: 0,075%) |
| stessa bolla del vicino più prossimo | **0,0%** |
| almeno una bolla in comune fra i primi 10 | **2,6%** |

**Tre volte il caso: è rumore.** La proiezione dai metadati **non** predice il pubblico.

## Parte B — otto uscite del 2026 che il grafo non ha: la collocazione è ottima

| film | dove finisce | vicini |
|---|---|---|
| **Project Hail Mary** (8.150 voti) | fantascientifico spaziale | Gravity, La quinta onda, Oblivion, After Earth |
| **Obsession** | horror | Slender Man, Ouija, Oculus, Lights Out |
| **Michael** (biopic su Michael Jackson) | biopic musicale | **Elvis, Judy**, Beautiful Boy, The Founder |
| **Odissea** | epico mitologico | **Troy, La furia dei titani, Gods of Egypt**, Conan |
| **Super Mario Galaxy** | animazione per famiglie | **Sonic**, Ralph spacca Internet, I Croods 2, Super Mario Bros. |
| **Spider-Man: Brand New Day** | supereroi | **X-Men: Dark Phoenix, No Way Home, Deadpool 2**, Avengers |
| **Backrooms** | horror psicologico | Smile, Vivarium, Men, Noi |
| **Disclosure Day** | fantascienza | La Torre Nera, Sfera, La guerra dei mondi |

**Otto su otto in un mondo coerente e nominabile.** E il caso che ha aperto tutto questo:

> **VERITY** (30/09/2026, 95 voti, mystery/thriller, regia Michael Showalter) → **bolla 632**, 36 titoli, con **L'amore bugiardo - Gone Girl**, Il segreto dei suoi occhi, The Guilty, Un piccolo favore, Man in the Dark. **Thriller psicologico tratto da un romanzo**: il mondo giusto.

## La riconciliazione, che è il vero risultato

Le due parti sembrano contraddirsi e invece dicono due cose diverse:

- la Parte A chiede *«la proiezione riproduce il pubblico?»* → **no** (0,0%)
- la Parte B chiede *«la collocazione è semanticamente giusta?»* → **sì** (8/8)

**Cioè: quello che la proiezione recupera NON è il comportamento — è la struttura dei metadati.** Il che, per il prodotto, è esattamente ciò che serve: un film appena uscito non ha pubblico, e quel che si vuole è che finisca **nel mondo giusto**. Ma va detto: **la personalizzazione via comportamento previsto non c'è.** La proiezione è un buon collocatore, non un predittore di gusto.

Conseguenza per il ticket 04: **il banco va misurato sulla collocazione semantica, non sulla sovrapposizione col CF** — che sarebbe misurare la cosa sbagliata.

## La decisione che il ticket 01 aveva lasciato aperta

I vocabolari sono congelati sul catalogo, e **si vede**: il regista di Verity, id TMDB 22215, **non è nel vocabolario delle 3.000 persone** → la proiezione **non lo conosce**. Ci arriva lo stesso, dalle keyword e dal cast. Ma per un film del 2026 il cast e la regia sono quasi tutti fuori vocabolario.

**Deciso**: si ignora la categoria nuova (nessuna colonna), e si dichiara. Le alternative (mapparla alla più vicina) inventerebbero un segnale che non c'è.

## Un errore mio, da dichiarare

Il primo giro della Parte B era **sbagliato**: usavo `TfidfTransformer().fit_transform()` su **una riga sola**, calcolando l'IDF da quella riga. Il risultato era che **ogni** film nuovo riceveva gli stessi vicini (*L'abbinamento perfetto*, *The Strays*, *Io vengo ogni giorno*) — un vettore degenere. Con l'IDF **congelato sul catalogo** i risultati cambiano completamente, ed è la versione qui sopra.
