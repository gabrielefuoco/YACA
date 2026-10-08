# 12 — Il trasferimento alle serie: 0%, e adesso?

**Status**: `needs-triage` · **Type**: `research` · **Aperto**: 08/10/2026 · **Blocked by**: nessuno

## Il problema aperto più grande

Le serie sono l'**80% delle cronologie reali** e MovieLens è **cieco al 100%** su di loro (`links.csv` rimanda
solo a `/movie/{id}`). Il valore del filone poggia quindi su un assunto mai verificato: che lo student,
addestrato sui film, sappia collocare le serie.

## Cosa è stato misurato (e non è una vittoria)

- **film → serie dentro il grafo: 0,0%** (i semi di soli film non raggiungono le serie).
- Con i topoi del sottografo la distanza si è **ridotta in testa**: lo student sulle serie 9,9% → **12,7% @50**,
  il blend 15,0% contro il baseline 13,0% @50.
- Ma **nessuna vittoria netta**: sulle serie @200 lo student fa 26,0% contro 41,7%, sui film 2,1% contro 5,4%
  @50. Vince un numero e perde su tutti gli altri.
- Riferimento Node (banco precedente): film→serie **18,2% @50 contro 4,1% del caso**.

## Cosa decidere

1. Serve un **teacher per le serie**, o basta il ponte topoi? Se basta, il ponte va reso esplicito (semi misti
   film+serie) e misurato a parità di budget; se non basta, il filone ha un tetto dichiarato all'80% dei casi
   d'uso — e va detto *ora*, non alla fine.
2. MAL/AniList coprono gli anime con mappatura per titolo: valutare **solo dopo** il punto 1.
3. Il transfer va misurato **senza leakage**: la verità deve restare su item che lo student non ha visto.

**Questo ticket è la priorità più alta fra gli aperti**: è l'unico che può ridimensionare tutto il resto.
