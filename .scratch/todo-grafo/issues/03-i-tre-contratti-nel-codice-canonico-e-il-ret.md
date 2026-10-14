Status: resolved
Type: task

# 03 — I tre contratti nel codice canonico, e il retro-test sui sei artefatti

Trasformare i controlli manuali in contratti automatici (§4), e **dimostrare che avrebbero
fermato i sei artefatti storici**. Il secondo punto e' quello che conta: un contratto che non
fallisce su un bug vero non e' un contratto.

1. **Anti-pareggio** dentro `canone.py:ranghi()` e prima di ogni `argsort`: se il top-50 di una
   colonna e' costante, `AssertionError`. (Il bug della maschera sulle serie e l'inversione di
   `verifica-popolare.py` sarebbero morti qui.)
2. **Tasso base**: un helper in `canone.py` che accetta una funzione di predizione e restituisce
   `(H_oss, H_caso, lift, kappa)` con `H_caso` da permutazione. Da usare **sempre** al posto di una
   percentuale nuda. (Il 79,4% di adiacenza delle bolle e' l'artefatto che questo avrebbe smascherato.)
3. **Non-vuotezza**: `assert_componente` in `bolle.py` sul grado mediano e sulla copertura, chiamato
   dopo la costruzione di `GEN`/`KW`/`CA`/`SIG`. (`genres` mancante e `CAST` azzerato a 0.12
   sarebbero morti qui.)

Retro-test: rieseguire i sei artefatti con i contratti attivi e riportare, per ciascuno, quale
`assert` lo ferma. Se qualcuno non viene fermato, il contratto e' incompleto: dire quale parte manca.
Esito: `ricerche/03-contratti.md`.

## Esito

6 artefatti su 6 fermati, zero falsi allarmi. Ma ci sono voluti QUATTRO contratti invece dei tre di §4, perche' il retro-test ha smascherato tre errori nei contratti stessi: `assert_ordine` misurava il verso sbagliato e dava il via libera proprio al bug di `verifica-popolare.py`; `assert_modello` chiedeva |r| > 1e-6, che non ferma niente; l'anti-pareggio guardava un asse solo e solo lo span, non i pareggi in testa. Resta una lacuna dichiarata: una classifica sparsa ma legittima non si ferma, perche' solo il chiamante sa quanti candidati dovrebbero avere un punteggio. Il tasso base applicato al caso che l'ha generato: lift 1,18x. Vedi `ricerche/03-contratti.md`.
