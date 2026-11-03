Status: resolved
Type: task

# Valutazione: bootstrap appaiato, MDE, SNIPS e surprise-recall

## Perché

Oggi giudichiamo differenze di 0,003-0,008 su R@20. Con 499 sorgenti e 3.533 link clusterizzati nei
semi, l'unità di ricampionamento è la **sorgente**, non il link. L'MDE dichiarato dal senior è ≈0,015
a potenza 80% (soglia di significatività ≈0,010-0,012). Metà dei nostri confronti recenti sono rumore.

## Cosa fare

1. `bootstrap.py`: ricampiona le 499 sorgenti con reimmissione (10.000 repliche), calcola per ogni
   grafo R@5/10/20 e MRR, e riporta per ogni coppia di grafi la differenza appaiata con IC 95% e
   l'MDE a potenza 80%. Output: tabella + verdetto "sopra/sotto l'MDE" per riga.
2. `snips.py`: valutazione controfattuale sui log Trakt (~19k utenti) con split temporale 70/30.
   Propensione `p_j ∝ (freq_trakt(j) + τ)^γ`, γ=0,75, peso dell'hit `1/p_j`, normalizzato (SNIPS).
3. `surprise.py`: surprise-recall@20 = recall pesato per l'auto-informazione `-log p_j` del titolo
   raccomandato. Misura "quanto è ovvio" senza etichette umane.
4. Il comando `valuta.py <grafo...>` deve stampare i tre assi insieme (banco, SNIPS, surprise) più la
   quota >5k voti in top-10 sui 200 semi popolari già usati in `misura-curva.py`.

## Criteri di accettazione

- Il confronto `v18` contro `v18tau-2.0` produce IC e verdetto, e i due grafi risultano
  statisticamente indistinguibili (atteso: la differenza è 0,003).
- `valuta.py` gira in < 5 minuti su un grafo.
- Il README del modulo di valutazione dichiara l'MDE e la potenza, così nessuno riporta differenze
  sotto soglia come risultati.

## Note

Questo ticket non cambia il grafo. Serve a non sprecare i successivi.

---

## Esito

`services/graph_dense/valuta.py`: tre assi (banco, quota >5k, SNIPS/surprise) + `bootstrap_appaiato`
con IC95 e MDE. `services/graph_dense/trakt.py`: cache npz dei 4.452 file Trakt, split temporale 70/30,
propensioni `(freq+tau)^0,75`.

MDE misurato sul banco reale: **0,009-0,011 su R@20** a 499 sorgenti. Le differenze di 0,003 viste in
passato sono rumore per costruzione.

**Bug trovato subito dallo strumento**: `r5/r10/r20` sommavano i pesi dei link invece di contarne il
numero, gonfiando il recall di ~2,4× (0,636 invece di 0,268). Corretto, con test che lo blocca.

### Il terzo asse in funzione

Su 4.452 file Trakt: 1.859 utenti, 720.531 interazioni, 1.828 casi con split 70/30.
`SNIPS` e `surprise` hanno dato un verdetto **opposto** al banco curato sulla chiusura: banco
"indistinguibile", SNIPS +0,026 sopra l'MDE. È la prova che il banco da solo non basta.
