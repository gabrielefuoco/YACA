# 🧬 Algoritmi e Logiche di Scoring

YACA utilizza un sistema di raccomandazione ibrido che combina segnali comportamentali dell'utente (Trakt/Stremio) con metadati statistici (TMDB). Questo documento approfondisce le formule matematiche e le euristiche utilizzate.

## 1. Il Motore di Affinità (`ProfileScorer.js`)

Il cuore dell'intelligenza di YACA risiede nel calcolo dello score di affinità, che determina la posizione di un contenuto nei cataloghi personalizzati.

### Formula di Scoring Finale
Lo score finale (0-10) è una media ponderata tra il match del profilo utente e il rating statistico globale:

$$Score = \frac{(ProfileMatch \times TraktWeight) + (BayesianScore \times TMDBWeight)}{TraktWeight + TMDBWeight} + \epsilon$$

- **ProfileMatch**: Affinità del contenuto con i gusti dell'utente (Generi, Registi, Attori).
- **BayesianScore**: Rating statistico "pulito" (IMDb formula).
- **$\epsilon$ (Epsilon)**: Un micro-offset deterministico che ruota giornalmente per garantire varietà.

### Suddivisione dell'Affinità (ProfileMatch)
L'affinità viene calcolata su due assi principali:
1.  **Assi Tematici (90%)**: Generi e Keywords. Se un utente guarda molti film "Cyberpunk", il peso delle keyword domina lo score.
2.  **Assi Autoriali (10%)**: Registi e Cast. Funziona come un "bonus di precisione" per far emergere opere di autori amati.

---

## 2. Bayesian Weighted Rating

Per evitare che film con pochissimi voti (es. un 10.0 con 1 solo voto) scalino le classifiche, YACA applica la formula di IMDb:

$$WR = \left( \frac{v}{v+m} \times R \right) + \left( \frac{m}{v+m} \times C \right)$$

- **v**: Numero di voti del contenuto.
- **m**: Soglia minima (default: 300 voti).
- **R**: Voto medio del contenuto.
- **C**: Voto medio dell'intero catalogo (6.5).

*Risultato: Un film con poche recensioni viene "tirato" verso la media globale (6.5), mentre i capolavori con migliaia di voti mantengono il loro score reale.*

---

## 3. Accumulo Logaritmico (Logarithmic Decay)

In `ProfileBuilder.js`, quando l'utente guarda un nuovo contenuto, il profilo non viene aggiornato linearmente. Si usa il **diminishing returns** per evitare che il profilo diventi "piatto" o troppo sbilanciato su un solo genere:

$$NuovoScore = Current + \frac{Incremento}{1 + \ln(1 + Current)}$$

*Effetto: Più ami un genere, più è difficile "spostare l'ago della bilancia" solo con quel genere. Questo costringe il sistema a cercare sfumature diverse.*

---

## 4. Detection del Binge-Watching

YACA rileva sessioni di visione intensa per pesare diversamente gli interessi passeggeri:
- **Sessione**: Gruppo di contenuti guardati con un gap < 2 ore.
- **Binge Trigger**: Se una sessione contiene $\ge 3$ elementi, viene applicato un **Binge Multiplier**.
- **Logica**: Una serie divorata in una notte ha un impatto più forte sul DNA del profilo rispetto a un film guardato casualmente ogni tanto.

---

## 5. Epsilon Tracker (Rotazione Deterministica)

Per evitare che i cataloghi appaiano statici, viene aggiunto un valore $\epsilon$ calcolato come:

$$\epsilon = ((TMDB\_ID \times DayOfYear) \pmod{1000}) \times 0.000001$$

Questo garantisce che, a parità di score, l'ordine dei film cambi leggermente ogni 24 ore alla mezzanotte UTC, dando visibilità a contenuti diversi nella "seconda fila" della griglia.
