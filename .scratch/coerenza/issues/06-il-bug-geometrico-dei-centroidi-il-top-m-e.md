Status: resolved
Type: task

# 06 — Il bug geometrico dei centroidi: il top-M e gli esemplari

Il §5.1, ed è il difetto che spiega la curva 100% → 21%: la normalizzazione L2 **diluisce** i
centroidi grandi (migliaia di token non nulli) e **appuntisce** quelli piccoli. Le micro-bolle
battono sistematicamente le bolle grandi.

Due correzioni da misurare, non da scegliere a intuito:
1. **Top-M sparsification**: dalla media dei membri si tengono i soli `M ∈ [25, 35]` token più alti,
   **e solo dopo** si normalizza a L2 = 1.
2. **Scoring ibrido**: `0,5 · ⟨x, μ_b^(M)⟩ + 0,5 · (1/5) Σ_{j ∈ Top5(b,x)} ⟨x, v_j⟩`, dove i Top5
   sono i membri della bolla più simili a x. Così cinque thriller gemelli dentro una bolla da 100
   non vengono annacquati dagli altri 95.

Si misura sul banco (LOO esatto) **e** sulla curva per dimensione di bolla: la domanda è se il
ginocchio a 100 titoli si appiattisce.

Esito: `06-centroidi-geometria.py` + `ricerche/06-centroidi.md`.

## Esito

DUE RISULTATI, uno cambia la diagnosi e uno la conferma in modo brutale. (1) IL TOP-M PEGGIORA: 32,0% -> 28,5% a M=15. E non c'e' nessuna distorsione geometrica da correggere: la correlazione fra dimensione della bolla e successo, con V3, e' **+0,003**. La curva 100% -> 21% che il senior cita era sulla variante V0; con V3 la fascia 0-10 resta speciale (mondi di 5-8 film che si trovano per definizione) ma sopra i 10 titoli la dimensione non predice niente. (2) L'IBRIDO COI TOP-5 ESEMPLARI FUNZIONA, poco e dove serve: 33,2% contro 32,0%, con +7,7 punti sulle bolle sopra i 120 titoli e -2,2 su quelle fra 30 e 60. (3) E LA PRIMA MISURA DAVA 55,8%: era TUTTA DATA LEAKAGE — la serie in esame e' membro della sua bolla, e la sua auto-similarita' (1,0) entrava nei top-5. Azzerando la diagonale: 33,2%. E' il terzo leak della sessione, ed e' esattamente quello che il contratto di §4.1 ferma. La curva che sembrava appiattita si e' ri-monotizzata. Vedi `ricerche/06-centroidi-geometria.md`.
