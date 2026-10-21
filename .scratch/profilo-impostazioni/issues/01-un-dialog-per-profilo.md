Status: resolved
Type: task

# 01 — Impostazioni del profilo in un dialog solo (nome, emoji, kids, filtro anime)

## Perché

Le tre icone (baby, matita, cestino) nella riga dei profili, il pannello «Selettori di Tipo» con due
checkbox mutuamente esclusive sotto la griglia, e il dialog a parte per il nome: tre posti per
configurare la stessa cosa. In più l'emoji non esisteva come campo — l'avatar mostrava il primo
carattere del nome, e rinominare poteva cancellarla.

## Cosa è stato fatto

- Nuovo `components/modals/ProfileSettingsDialog.tsx`: anteprima avatar, nome, griglia di 18 emoji
  (+ «nessuna»), switch modalità bambini, segmento a tre stati per il filtro anime, «Elimina profilo»
  in fondo (solo per i profili non-global).
- `ProfileManager`: via le tre icone e l'intero pannello dei selettori; al loro posto un bottone
  **Impostazioni**. La card mostra i marcatori `Bambini`, `Solo anime`, `No anime` quando attivi, e
  usa `profile.emoji` per l'avatar.
- `Profile.emoji` + `BackendProfile.emoji` + `profilesToApiPayload` + `mapBackendProfile`.
- Backend: `emoji: String` nello schema dei profili (`AddonConfig`), copia in `profileProcessor`.
- Profilo globale rinominabile: tolto il congelamento in **entrambi** i punti
  (`profileProcessor` e `useProfiles.updateProfile`).
- `RenameProfileDialog` eliminato; i default usano `name: 'Generale'` + `emoji: '🏠'`.

## Verifica (21/10)

Mock delle API + input vero via CDP a 390px:

- l'ingranaggio apre «Impostazioni profilo» con **18 emoji** e **3 segmenti** (Tutti / Solo anime / No anime);
- scegliendo 🎬 + «Solo anime» + Salva il payload `POST /api/configurazione` porta
  `emoji: "🎬"`, `settings.typeSelectors.anime: "only"`, `settings.kidsMode: false`;
- rinominando in «Cinema» il payload porta `name: "Cinema"` (prima restava «Generale»: il nome era
  congelato due volte);
- la card del profilo mostra 🎬 / Cinema / SOLO ANIME / ATTIVO.

Non verificato qui: la persistenza su Mongo e la comparsa dei nuovi campi dopo un reload reale
(serve backend + sessione). Build e `tsc` verdi.
