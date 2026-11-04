Status: wontfix
Type: task
Blocked by: 13

# L'equilibrio fra copertura e precisione: sweep di topk sulla COVISION

## Cosa sappiamo già (misurato)

Il ticket 03 aveva introdotto un taglio nascosto: `covision.py` senza `--semplice` tronca ogni riga a
`--topk` (default 20), mentre il ramo `--semplice` usciva prima di quel taglio. Rifatta con `--topk 100`:
3.950.110 archi contro 1.112.164.

| grafo | copertura | R@20 | R@20 dentro la copertura |
|---|---:|---:|---:|
| V15 (`--semplice`, ~150 archi/riga) | 29,5% | **0,090** | **30,4%** |
| V21 (topk 20) | 26,0% | 0,071 | 27,5% |
| V22 (topk 100) | **29,1%** | 0,075 | **25,9%** |

**Allargare recupera copertura ma peggiora la precisione**: gli archi aggiunti sono deboli e affogano
quelli buoni. Il punto di equilibrio è fra 20 e 100, o nella forma del peso (non nel numero di archi).

## Cosa fare

1. Sweep `--topk` ∈ {30, 50, 70} sulla COVISION (sconto temporale attivo), pipeline completa.
2. In alternativa, provare una **decadenza sul rango** dentro la COVISION (peso ~ 1/rango) invece del
   taglio secco.
3. Misurare su dev set + banco tonale (a fine giro): copertura, R@20, R@20 dentro la copertura.

## Criteri di accettazione

- Trovare una configurazione con copertura ≥ 28% **e** R@20 dentro la copertura ≥ 30% (oggi V15 è
  l'unico a stare sopra 30%).

---

## Chiuso: risposto dalla misura V22

Lo sweep era già stato fatto una volta, come effetto collaterale del ticket 03: `--topk 20` → `--topk 100`
sulla COVISION porta gli archi da 1,11M a 3,95M, la copertura dal 26,0% al 29,1% (quella di V15), e
`R@20` da 0,071 a 0,075 — **+0,0038, sotto l'MDE** — mentre la precisione *dentro* la copertura
peggiora da 27,5% a 25,9% (V15: 30,4%).

Il punto di equilibrio non si trova nel numero di archi: con la forma attuale del peso, allargare compra
copertura debole. Servirebbe una **decadenza sul rango** dentro la COVISION (peso ∝ 1/rango) invece del
taglio secco — ma è una modifica al tipo, non uno sweep, e su un dev set con MDE 0,006-0,008 va
affrontata solo se si riapre il filone.
