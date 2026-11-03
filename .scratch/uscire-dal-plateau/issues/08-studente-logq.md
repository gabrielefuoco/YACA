Status: ready-for-agent
Type: task
Blocked by: 01

# Studente cold-start: correzione logQ e modality dropout

## Perché lo studente è peggiorato

Da R@20 0,251 (vecchio studente) a 0,198 (V18), per tre motivi identificati:

1. `estendi-canone.py` ha aggiunto 10.238 titoli con partizione e blocchi comportamentali vuoti,
   portando il denominatore del softmax da 66.259 a 76.497 e **diluendo i target** del maestro.
2. La loss `-(P * log_softmax(logits)).sum(1)` è un softmax pieno **senza correzione di frequenza**:
   gli hub ad alto in-degree ricevono gradiente positivo continuo e attirano i vettori incerti.
3. In inferenza cold-start il blocco comportamentale vale zero, ma durante il training è quasi sempre
   presente: il ramo metadati non impara mai a supplire.

## Cosa fare

1. **LogQ**: sottrarre `λ·log Q_j` (massa marginale in entrata del nodo `j` nel maestro) dai logit
   **durante il training**, non in inferenza. Stima la PMI invece della probabilità a posteriori
   distorta dalla popolarità.
2. **Modality dropout**: `p=0,50` sul ramo comportamentale, `p=0,25` sul ramo keyword, con
   rinormalizzazione dinamica dei blocchi attivi. Costringe il ramo metadati+trama a reggere da solo.
3. Ritagliare il softmax ai **top-1.000 negativi per riga** per non pagare 76.497 classi per passo.

## Criteri di accettazione

- R@20 dello studente **da solo** (senza gli altri tipi) ≥ 0,24 in cold-start sui titoli con sola
  metratura (cioè valutato sui nodi con blocchi comportamentali azzerati).
- Fedeltà al maestro invariata: ricostruzione dei vettori salvati entro 1e-6.
- Il nuovo `rrfstudent-v19.npz` **sostituisce** il vecchio: nessuna unione dei due (la V18b esplorativa
  non è la direzione voluta).

## Costo

~15 minuti di GPU, 30 epoche su 76.497 nodi.
