Status: resolved
Type: task

# 04 — I 349 centroidi TF-IDF delle bolle-serie

Costruire il vettore centroide `mu_b` per ogni bolla a maggioranza serie (§1.B.1).

Contenuto, come chiede l'esperto, ma verificando quali colonne servono davvero: `keywords`,
**`genres` (ripristinati)**, `networks`, `production_companies`, `production_countries`,
`original_language`, `cast`, `created_by`.

Punti da decidere con una misura, non a intuito:
- il numero vero di bolle a maggioranza serie (l'esperto dice 349: verificare)
- se pesare i membri per purezza interna (una bolla pura e una contaminata riceverebbero lo stesso
  vettore medio) o se il peso lineare basti
- la normalizzazione: che il coseno diretto sia confrontabile fra bolle di dimensioni diverse

Controllo di leggibilita': stampare i primi termini di una decina di centroidi e **guardare se
nominano un mondo** (la bolla di *Banana Fish* dovrebbe avere anime/seinen/MAPPA/JP). Se i centroidi
non sono nominabili a occhio, il vettore e' sbagliato, e si vede qui e non al ticket 05.
Esito: `04-centroidi.npz` + `ricerche/04-centroidi.md`.

## Esito

336 bolle-serie — l'esperto ne diceva 349, e la differenza e' il criterio: io chiedo maggioranza di serie E almeno 5 titoli. 13.594 serie coperte, 122.314 termini (scartati 177.628 con df=1), 1.315.955 valori. IL CONTROLLO DI LEGGIBILITA' PASSA: i centroidi nominano mondi veri — isekai su Tokyo MX, K-BL, K-drama su KBS2 (Reply 1988), famiglia reale britannica (Downton Abbey + Harry & Meghan), fantasy anime (Frieren). E si vedono `pa:JP`, `pa:KR`, `rt:kbs2`: il quinto bug del ticket 01 paga esattamente dove serviva. Due pesature dei membri (uniforme, per grado interno) da confrontare al ticket 05.
