Status: ready-for-agent
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
