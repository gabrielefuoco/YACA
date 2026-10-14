Status: resolved
Type: task

# 05 — Il voto diretto: di quanto sale il 2,2% delle serie

Misurare il voto 1 su banco vero: le 600 serie nascoste, collocate **solo** col coseno
contro i 349 centroidi.

Confronto con le tre baseline gia' misurate:
- studente dei film sulle serie: 2,2% nella propria bolla (1,8% scollegate)
- studente delle serie: 1,3% (0,2% scollegate)
- caso: 0,062%

E col **tasso base** che l'esperto pretende, non una percentuale nuda: `(H_oss, H_caso, lift, kappa)`,
piu' il confronto fra le due strade (voto diretto, ponte) bolla per bolla: su quante serie i due
voti sono d'accordo, su quante il diretto vince dove il ponte fallisce e viceversa. Il disaccordo
e' l'informazione: dice quale strada serve davvero a chi.
Esito: `ricerche/05-voto-diretto.md`.

## Esito

DA 2,2% A 35,3%. Voto diretto (coseno, leave-one-out esatto) sulle 336 bolle-serie: 212/600, lift 85x per permutazione, kappa +0,351, scollegate 0,3%. Sui 506 casi con la bolla in gara: 41,9%. IL TETTO E' 84,3% e le 94 serie escluse sono 94/94 in bolle a MAGGIORANZA FILM: i casi cross-medium, che il vincolo di medium esclude e che §1.B.2 voleva recuperare. La pesatura per grado interno NON aiuta (28,7% contro 29,7%): si usa quella uniforme. E il report racconta i TRE numeri: 29,7% (senza normalizzare il centroide), 63,7% (leave-one-out incompleto, gonfiato), 35,3% (giusto).
