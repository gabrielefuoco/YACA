Status: resolved
Type: task
Blocked by: 01

# La "chiusura triangolare" moltiplica per i vicini comuni: sostituirla con Adamic-Adar

## Il difetto, misurato

`chiudi.py` fa `S.multiply(O) + alpha0*S` con `O = (S>0) @ (S>0).T`: **non aggiunge archi**, moltiplica
ogni peso per il numero di vicini comuni binari. Sulla riga di *Barbie*: 532 archi prima, 532 dopo,
0 nuovi; moltiplicatori ×1211 (*Wonka*), ×971 (*Puss in Boots 2*), ×871 (*EEAAO*), contro ×3,1 per un
legame con 3 vicini comuni. Distorsione ~390×, applicata **dopo** mixer e damping.

## Cosa fare

1. Misurare tre varianti sullo stesso mixer (`services/graph/data/v18tau-2.0/MIX-rrf-dc-dt.npz`):
   - **A** nessuna chiusura (identità);
   - **B** chiusura attuale (`alpha0=0.1`, come oggi);
   - **C** chiusura Adamic-Adar: `M_ij *= (alpha0 + Σ_k 1/log(1+deg(k)))` sui vicini comuni `k`.
2. Riportare per ognuna: banco (con IC del ticket 01), quota >5k in top-10, e la top-10 di *Barbie*,
   *Drive*, *Parasite*, *The Truman Show*.
3. Scegliere e scrivere in `V18.md` la variante vincente, con il numero che la giustifica.

## Criteri di accettazione

- La variante scelta non perde più di 0,005 di R@20 rispetto a B (se perde di più, il moltiplicatore
  stava sostenendo il banco: dichiararlo e passare al punto 4).
- Su *Barbie* l'arco verso Greta Gerwig risale nella top-20 (oggi i tre archi stanno ai ranghi 3/15/46
  prima della chiusura e spariscono dopo).
- `chiudi.py --modo {nessuna,attuale,adamic-adar}` con default esplicito, e il modo finisce nella
  provenienza dell'artefatto (ticket 12).

## Trappola nota

Se il rank della riga viene rinormalizzato dopo, l'effetto è solo sull'ordine interno. Non
rinormalizzare prima di aver misurato: cambia il confronto con le varianti A e B.

---

## Esito (misurato)

Tre varianti sulla stessa miscela (`v18tau-2.0/MIX-rrf-dc-dt.npz`), banco 499 con bootstrap appaiato
(10.000 repliche, IC 95%), MDE(80%) = 0,009-0,011 su R@20:

| chiusura | R@5 | R@10 | R@20 | MRR | >5k top-10 | R@20 vs attuale | Lady Bird in *Barbie* |
|---|---:|---:|---:|---:|---:|---|---:|
| attuale (conteggio) | 0,143 | 0,205 | 0,268 | 0,0999 | 68,2% | — | #61 |
| nessuna | 0,143 | 0,195 | 0,256 | 0,0996 | 73,2% | **−0,0119 (sopra MDE)** | #10 |
| Adamic-Adar | 0,143 | 0,206 | 0,265 | 0,0995 | 68,0% | −0,0027 (sotto MDE) | #63 |
| **log** (adottata) | **0,146** | 0,204 | 0,264 | **0,1023** | 72,3% | −0,0040 (sotto MDE) | **#19** |

**La forma del fattore conta più del peso.** Adamic-Adar riduce il peso degli hub ma moltiplica ancora
per il numero di vicini comuni: la cricca resta avanti (×11 contro ×1,5) e l'arco autoriale non risale.
Il logaritmo del conteggio comprime la cricca da ×1211 a ×7,1 (rapporto cricca/autoriale da ~390× a
~4×) e centra il criterio di accettazione (Lady Bird #19 < 20) senza perdere nulla di misurabile sul
banco: R@20 −0,004 è **sotto l'MDE**, MRR e R@5 migliorano.

Costo dichiarato: la quota di blockbuster in top-10 sale da 68,2% a 72,3%. È esattamente il fronte del
ticket 04 (gate asimmetrico), che va fatto dopo.

Artefatti: `services/graph/data/v18chiudi/{nessuna,adamic-adar,log}.npz`. Default di `chiudi.py` = `log`.

### Il terzo asse conferma (SNIPS sui log Trakt)

120 utenti, split temporale 70/30, propensioni `(freq+1)^0,75`:

| chiusura | curato R@20 | >5k | SNIPS | surprise |
|---|---:|---:|---:|---:|
| attuale | 0,268 | 68,2% | 0,130 | 0,035 |
| **log** | 0,264 | 72,3% | **0,156** | **0,042** |

`SNIPS: log − attuale = +0,0258 [IC95 +0,0103, +0,0415] · MDE(80%) = 0,0222` → **sopra l'MDE**.
Il banco curato (che premia la popolarità) dice "uguali"; la valutazione de-biasata dice che `log`
predice meglio il **futuro** degli utenti. Le due cose insieme sono la ragione per adottarlo: non
guadagna sul banco dove il banco è distorto, guadagna dove la distorsione è corretta.
