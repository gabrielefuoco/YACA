# Ticket 03 — Le 94 cross-medium: si toglie il vincolo e si misura

`Status: resolved` · 14/10/2026 · esito di `03-cross.py` (log in `log/03-cross.log`)

**Esito: il vincolo di medium non costa niente.** Tolto, il totale resta **35,3%**: si guadagna il
**10,6% sulle 94** e si perdono **2 punti sulle 506**. Netto zero. Il problema delle 94 non è il
vincolo, e va scritto perché il ticket partiva da un'inferenza sbagliata — **mia**.

---

## Il numero che ribalta la premessa

```
copertura: A 506/600 · B 600/600
```

Con i centroidi anche delle bolle-**film** (1.189, costruiti qui, tenuti sparsi), **tutte e 600** le
serie hanno la bolla vera fra i candidati. Nel ticket 05 avevo misurato che 506 su 600 stavano fra le
**336 bolle-serie** e ne avevo dedotto che le altre 94 fossero «escluse dal vincolo di medium». La
seconda metà è vera per definizione — le 94 hanno una bolla a maggioranza film, quindi non sono in
`bolle_serie` — ma **non è la causa del loro fallimento**. È una confusione fra «esclusa da questa
lista» e «esclusa da questo metodo», e si vede solo misurando il metodo senza il vincolo.

## Le tre configurazioni

| | propria bolla |
|---|---|
| **A. solo bolle-serie** (com'è adesso) | **35,3%** (212/600) |
| **B. tutte le bolle**, vincolo tolto | **35,3%** (212/600) |
| C. il film solo se batte il migliore serie di un margine | 35,3% → **36,3%** al margine 1,0 |

E separate:

| | A | B |
|---|---|---|
| le **506** con bolla-serie | **41,9%** | 39,9% ↓ |
| le **94** cross-medium | **0,0%** | **10,6%** (10/94) |

**A è meglio per le 506, B è meglio per le 94, e il totale è identico.** Il vincolo protegge le 506
dalla concorrenza di 1.189 bolle-film che non le riguardano, e costa alle 94 esattamente quanto
guadagna. La regola C — tenere il film solo se batte il migliore candidato-serie di un margine — dà
**+1%** al margine 1,0 (218/600): è la scelta leggermente migliore, ed è quella che va in produzione,
ma il guadagno è ai limiti del rumore e va detto.

Con i contratti: B fa **lift 90,4×**, A **85,3×**, kappa +0,351 per entrambe.

| configurazione | tasso base | lift | kappa |
|---|---|---|---|
| A. solo bolle-serie | 0,41% | 85,3× | +0,351 |
| B. tutte le bolle | 0,39% | 90,4× | +0,351 |

## Chi sono le 94

Stanno in **65 bolle diverse** (una bolla può contenerne più d'una), da **16 a 151 titoli**, mediana
**68**. La quota di serie in quelle bolle ha mediana **0,26**: sono bolle **tre quarti film**.

| bolla | titoli | % serie | le serie dentro | cosa c'è nella bolla |
|---|---|---|---|---|
| 17 | 151 | 42% | Seeking Persephone, Blood, Sex & Royalty | Piranha 3DD, Status Update, Thirteen Days |
| 60 | 114 | **15%** | Chalupáři, Návštěvníci | La famiglia omicidi, Tre noci per Cenerentola |
| 69 | 108 | 35% | **Ultraman Orb, Ultraman Nexus** | Osiride, The Adventurers |
| 43 | 125 | 39% | Primo, Glaskupan | Malèna, Youth, A Dangerous Method |
| 97 | 108 | **13%** | I miei amici Tigro e Pooh, Starzinger | Mai senza mia figlia, Tuntematon sotilas |

**Sono serie intrappolate in minestroni generici di film**, non in mondi nominabili. Una serie come
*Ultraman Orb* sta in una bolla che si chiama, nei fatti, «film di avventura vari». Non è il medium a
nasconderla: è che il suo mondo **non esiste come bolla**, perché non c'erano abbastanza serie per
formarlo. È la stessa diluizione che il ticket 05 ha misurato sulla dimensione delle bolle (85,7% di
successi sotto i 10 titoli, 21% sopra i 120), vista dall'altro lato.

**Conseguenza per la produzione:** il vincolo di medium **resta**, con la regola C (il film ammesso
solo se batte il migliore serie di un margine). Non perché risolva le 94 — non le risolve — ma perché
non fa danni e tiene i due cataloghi separati come il prodotto li vuole.

## Il tetto del metodo, ricalcolato

| | tetto | raggiunto |
|---|---|---|
| A, fra 336 candidate | 84,3% | **41,9%** sui 506 |
| B, fra 1.525 candidate | 100% | **35,3%** sul totale |

Il collo di bottiglia non è più la copertura dei candidati: è la **qualità dei centroidi** delle bolle
grandi e diffuse. Le 94 sono la coda visibile di quel problema, e non si risolvono col vincolo di
medium.
