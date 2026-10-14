Status: resolved
Type: task

# 02 — I 6+2 pesati, e una lettura a mano dei quartieri

Costruire la mappa finale sul grafo pesato e **leggerla**, perche' i numeri da soli non dicono se i
vicini hanno senso.

- 6 intra-medium + 2 ponti cross-medium, simmetrizzati per **unione** (come al ticket 07 di
  `todo-grafo`: la sostituzione lascia asimmetrie);
- il controllo di §2.4 nei due versi (Guerre stellari <-> The Mandalorian), che deve continuare a
  passare;
- e la parte che conta: **leggere una decina di quartieri** e dire se sono mondi. Il test umano che
  il ticket 07 non poteva fare, perche' aveva una mappa che non selezionava.
- Verificare che nessuna bolla resti **isolata** e che le 1.625 bolle restino raggiungibili dalla
  mappa (la componente piu' grande).

Esito: `bolle-nitrile-V8-mappa-pesata.npz` + `ricerche/02-mappa-pesata.md`.

## Esito

Mappa 6+2 pesata: 20.918 archi (60 volte piu' sparsa dell'adiacenza), 1 sola componente (1.625/1.625), 0 coppie asimmetriche, e il ginocchio SULLA MAPPA sale da 1,074 a 1,24. I QUARTIERI SI LEGGONO, ed erano la cosa che il ticket 07 di todo-grafo non poteva verificare: il fantasy/avventura anni '80 (Goonies, Labyrinth) ha per vicino piu' pesante Indiana Jones e Stand by Me; il seinen anime (SPYxFAMILY, Golden Kamui) ha Monster, Death Note, Berserk; il K-BL (Equals, My Love Mix-Up!) ha HIStory e Your Name Engraved Herein; il K-drama (Reply 1988) ha Mr. Sunshine, Goblin, Alchemy of Souls. Con del rumore, ma le prime posizioni sono sistematicamente giuste.
