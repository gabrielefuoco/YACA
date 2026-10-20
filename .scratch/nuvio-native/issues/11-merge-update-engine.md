Status: open
Type: research
Punto: P24
Blocked by: 02

# 11 — Merge e update: aggiornare senza distruggere

## Domanda

Come si aggiorna una collection YACA dentro Nuvio — che è un full replace — senza cancellare le folder
create dall’utente, senza duplicare quelle già presenti e senza perdere artwork/ordine? Serve un
algoritmo di merge e un piano di rollback, non “push e speriamo”.

## Cosa deve uscire

Una nota in `ricerche/11-merge-update-engine.md` con:

- **problema**: `sync_push_collections` full replace; cosa succede a collection/folder non incluse;
  cosa succede a ID duplicati; cosa fa il client con ID stabili.
- **ownership**: come marcare le folder YACA (`id` prefix, `yaca:`?), come riconoscere quelle
  dell’utente, come non toccare quelle di altri addon.
- **algoritmo**: three-way merge (base/live/local), refresh in place, inserimento delle nuove,
  rimozione delle orfane, dedupe per ID/titolo, preservazione artwork e ordine.
- **update modes**: add-only, replace, merge (default), rollback; cosa mostra la preview.
- **ID scheme**: collection, folder, source; versionamento; come gestire un rename.
- **test matrix**: utente che ha modificato una folder; utente che ne ha cancellata una; due versioni
  del pack; collection di altri addon; full replace fallito a metà.
- **backup**: cosa salvare prima del push, dove, per quanto.

## Fonti primarie

- Nuvio docs v1.3, sezione Collections + Sync strategies.
- NuvioTV: `CollectionsDataStore`, `CollectionSyncService`, `FolderDetailViewModel`.
- Kaptain: `collection-merge.js` (refreshInPlace, dedupeFolders, purgeClutter), `addon-core.js`
  (`mergeLists`, `savedMismatch`).
- Xperience: “safer Nuvio collection pushes — merge is now the default”.

## Come si chiude

La nota è pronta quando:

1. l’algoritmo è descritto in passi, con input/output;
2. l’ownership e gli ID sono definiti;
3. la test matrix copre i casi che rompono le collection;
4. c’è un piano di backup/rollback;
5. è chiaro cosa fare quando il merge non può decidere (conflitto).
