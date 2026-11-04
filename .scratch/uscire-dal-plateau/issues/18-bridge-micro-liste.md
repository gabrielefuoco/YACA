Status: wontfix
Type: task
Blocked by: 13

# BRIDGE: ponti di gusto in micro-liste (trama distante, gusti vicini)

## Perché

Coppie con coseno di trama < 0,25 ma co-occorrenza in liste piccole (≤ 50 titoli): sono i salti
stilistici estremi che nessun tipo attuale registra (es. *Watchmen* ↔ *Brazil*).

## Cosa fare

1. Dalle sole micro-liste (≤ 50 titoli, autori non holdout): coppie con coseno TRAMA < 0,25.
2. Peso = idf della lista (una lista piccola dice di più) × NPMI della coppia.
3. Tipo `BRIDGE`, top-100.

## Segnale di fallimento

Copertura dei nodi < 30% o grado mediano < 5: il segnale è troppo rado per entrare in fusione.

---

## Chiuso senza eseguire: la fonte è la stessa del ticket 14

BRIDGE si costruisce dalle micro-liste Trakt. Il ticket 14 ha misurato che **il nostro corpus di liste
non è tonale**: delle 1.117 liste utili solo il 2% ha un nome di tono, il 13% sono premi e classifiche.
BRIDGE userebbe lo stesso materiale con un filtro diverso (trama distante invece del nome): cambierebbe
il criterio, non la fonte. Se LISTSEM — che è la versione *forte* di quell'idea — non ha spostato nulla,
BRIDGE non ha motivo di esistere su questi dati.
