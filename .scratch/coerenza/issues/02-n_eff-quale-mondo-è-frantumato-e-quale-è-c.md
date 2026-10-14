Status: resolved
Type: task

# 02 — N_eff: quale mondo è frantumato, e quale è coeso

L'Indice di Frammentazione del Mondo (§1.B.1): per ogni tropo tematico `t` (le ancore con
`30 ≤ df ≤ 1500`), la distribuzione `P(b | t)` dei titoli che lo portano sulle bolle, e il suo
inverso di Herfindahl `N_eff(t) = 1 / Σ_b P(b|t)²`.

Il senior prevede `N_eff(film noir) ≈ 2,1` (coeso) e `N_eff(psychological thriller) ≈ 18,5`
(polverizzato). Due numeri da **verificare**, non da citare: se non tornano, è il metodo a sbagliare.

Si stampa la classifica per intero, dalle ancore più coese alle più frantumate, con la dimensione
delle bolle che le raccolgono. È la risposta automatica alla domanda «come si misura la coerenza di
un mondo senza chiedere a un umano».

Esito: `02-neff.py` + `ricerche/02-neff.md`.

## Esito

N_eff FUNZIONA, MA MISURA UN'ALTRA COSA, e le previsioni del senior non tornano. Il film noir non ha N_eff 2,1: ha 35,35. Il psychological thriller non ha 18,5: ha 101,78. La direzione e' giusta (35 contro 102), la grandezza no. Il pattern: in cima ci sono FRANCHISE — super sentai 1,17, James Bond 1,23, Ultraman 1,41, Gundam 1,97, MCU 3,46 — in fondo MODI che tagliano il catalogo per costruzione (revenge 418, new york city 360, love 354). N_eff misura quanto un TAG coincide con un MONDO, non quanto un mondo e' coeso: le due cose coincidono solo per i tag che sono gia' dei mondi. La banda utile e' 5-25 (iyashikei 7,81, true crime 8,32, spaghetti western 11,39): li' c'e' un mondo imperfetto, ed e' li' che si ripara. Vedi `ricerche/02-03-coerenza.md`.
