# shrinkage di riga

**Status**: `resolved`
**Type**: `task`
**Blocked by**: 02

Lo shrinkage di riga `d + tau`, e CFst solo sui nodi freddi.

**Il difetto.** `correggi_hub` (`canone.py:50`) chiama `normalizza`, che porta **la somma di ogni riga
di ogni singolo componente a 1.0** prima di sommare gli otto componenti (`canone.py:114-116`).
Conseguenze:
- un film con **30 archi forti** in CF o KW: ogni arco vero vale `1/30 x 1/8 = 0,004`
- lo stesso film con **un solo arco** in DIR o CAST: quell'arco solitario vale `1/8 = 0,125`, cioe'
  **30 volte un arco comportamentale vero**
- **ecco spiegato l'intruso del ticket 14**: Star Trek Into Darkness nella bolla Star Wars.
  J.J. Abrams ha diretto sia Star Trek Into Darkness sia Star Wars VII/IX: l'arco DIR viene gonfiato
  fino a dominare il grado locale, incollando due universi opposti.

**Fix**
1. **Shrinkage per riga**: dividere per `d + tau_c` (tau_c = peso mediano di riga del componente, o
   un pavimento di 5 vicini equivalenti) invece che per `max(d, 1e-9)`. Un film con 25 archi resta
   ~1.0; un arco solitario resta `w/(w+tau) ~ 0.15`.
2. **CFst solo sui nodi freddi**: azzerare CFst per ogni nodo che ha gia' almeno 5 archi in CF+B+TV.
   CFst e' uno studente progettato come salvagente per i titoli ciechi; sui titoli caldi e' una nebbia
   densa di somiglianze generiche (e pesa 1 su tutti i 66.259 titoli).
3. Alzare `min_sim` da 0.02 a 0.12-0.15 su KW e CAST: chiedere 30 vicini con coseno > 0.02 a una
   nicchia di 6 film riempie il grafo di archi spuri.

**Criterio di chiusura**
- Il banco sonda: **Star Trek Into Darkness deve uscire dalla bolla Star Wars**, e la bolla Star Wars
  deve restare unita. Le bolle d'autore non devono cambiare.
- Dichiarare quanti archi cambiano, non solo la lettura.

---

## Esito

Difetto vero e meccanismo dimostrato. Le bolle passano da 4.635 a 1.771, mediana da 11 a 30.
