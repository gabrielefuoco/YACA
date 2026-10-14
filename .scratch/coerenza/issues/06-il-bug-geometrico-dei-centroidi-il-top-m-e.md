Status: ready-for-agent
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
