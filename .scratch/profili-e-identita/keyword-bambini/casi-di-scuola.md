# Verifica dei 5 Casi di Scuola contro la Matrice TF-IDF

Verifica formale della lista nera approvata (Semi + Gruppo A + Gruppo B, per un totale di **400 keyword vietate**) integrata con il filtro di certificazione esistente e **nessun filtro di genere** sui 5 titoli di controllo stabiliti da spec e ticket.

### Risultato atteso vs Esito:
- **Inside Out**: AMMESSO (✓)
- **Shrek**: AMMESSO (✓)
- **Invincible**: ESCLUSO (✗) — Deciso da Blacklist keyword (`gore`) e certificazione `TV-MA`
- **Stranger Things**: ESCLUSO (✗) — Deciso dal filtro di certificazione esistente (`TV-14`); passa la lista nera keyword
- **Il Signore degli Anelli**: AMMESSO (✓) — Passa la lista nera keyword e la certificazione (PG-13 / T)

---

## [11] Inside Out (Inside Out)
- **Verdetto**: **AMMESSO (✓)**
- **Regola determinante**: Passa sia la lista nera keyword (nessun hit) sia la certificazione (`G` / Tutti). Nessun filtro genere.
- **Tutte le keyword (26)**: `3d animation`, `anger`, `cartoon`, `compassionate`, `disgust`, `dreams`, `duringcreditsstinger`, `elementary school`, `emotion`, `emotions`, `empathetic`, `enthusiastic`, `family`, `family relationships`, `fear`, `hopeful`, `imaginary friend`, `joy`, `memory`, `minnesota`, `pixar`, `psychological drama`, `running away`, `sadness`, `san francisco, california`, `unicorn`
- *Keyword presenti nel Gruppo C (Scartate)*: `['fear']`

## [85] Shrek (Shrek)
- **Verdetto**: **AMMESSO (✓)**
- **Regola determinante**: Passa sia la lista nera keyword (nessun hit) sia la certificazione (`PG` / T). Nessun filtro genere.
- **Tutte le keyword (23)**: `3d animation`, `anthropomorphism`, `appreciative`, `based on novel or book`, `bold`, `cartoon donkey`, `castle`, `donkey`, `dragon`, `enchantment`, `fairy tale`, `grand`, `liberation`, `lordship`, `magic`, `ogre`, `parody`, `prince`, `princess`, `robin hood`, `swamp`, `villain`, `woman director`

## [50168] INVINCIBLE (Invincible)
- **Verdetto**: **ESCLUSO (✗)**
- **Regola determinante**: **Blacklist Keyword** (`gore`) + **Certificazione** (`TV-MA`).
- **Keyword determinanti per il blocco**: `['gore']` (Seme originale)
- **Tutte le keyword (16)**: `adult animation`, `aggressive`, `alien`, `ambivalent`, `anti hero`, `anxious`, `based on comic`, `condescending`, `cruel`, `dramatic`, `gore`, `serious`, `super power`, `superhero`, `teen superhero`, `tragic`
- *Keyword presenti nel Gruppo C (Scartate)*: `['cruel']`

## [49806] Stranger Things (Stranger Things)
- **Verdetto**: **ESCLUSO (✗)**
- **Regola determinante**: **Filtro di certificazione** (`TV-14` intercettato da `/(?:^|[^0-9])(1[4-9])(?:[^0-9]|$)/`). La lista nera keyword viene superata senza blocchi (`horror`, `supernatural horror`, `teen horror` appartengono al Gruppo C scartato).
- **Keyword determinanti per il blocco**: Nessuna nella blacklist keyword. Bloccato a livello di certificazione d'età.
- **Tutte le keyword (17)**: `1980s`, `coming of age`, `depressing`, `experiment`, `friendship`, `government conspiracy`, `halloween`, `horror`, `indiana, usa`, `monster`, `parallel world`, `small town`, `super power`, `supernatural`, `supernatural horror`, `teen drama`, `teen horror`
- *Keyword presenti nel Gruppo C (Scartate)*: `['horror']`

## [16] Il Signore degli Anelli - La Compagnia dell'Anello (The Lord of the Rings: The Fellowship of the Ring)
- **Verdetto**: **AMMESSO (✓)**
- **Regola determinante**: Passa la lista nera keyword (nessun hit tra semi, A o B) e passa il filtro di certificazione (`PG-13` / `T` non è intercettato da `1[4-9]`). Nessun filtro di genere applicato.
- **Tutte le keyword (34)**: `allegory`, `anxious`, `based on novel or book`, `battle`, `bravery`, `castle`, `christ allegory`, `christ figure`, `christian allegory`, `christianity`, `comforting`, `companionship`, `dark fantasy`, `demon`, `dwarf`, `elves`, `epic`, `epic fantasy`, `fantasy world`, `good versus evil`, `hero's journey`, `hobbit`, `journey`, `live action and animation`, `magic`, `magical creature`, `obsession`, `sword and sorcery`, `trekking`, `troll`, `uncle nephew relationship`, `wistful`, `wonder`, `wraith`

## [23] Il Signore degli Anelli - Il ritorno del re (The Lord of the Rings: The Return of the King)
- **Verdetto**: **AMMESSO (✓)**
- **Regola determinante**: Passa sia la lista nera keyword sia la certificazione.
- **Tutte le keyword (49)**: `army`, `based on novel or book`, `bravery`, `castle`, `cheerful`, `christ allegory`, `christianity`, `companionship`, `complex`, `dignified`, `dwarf`, `earnest`, `elves`, `enchant`, `epic battle`, `epic fantasy`, `fantasy world`, `giant spider`, `good versus evil`, `grand`, `hero's journey`, `high fantasy`, `hobbit`, `honor`, `inspirational`, `intense`, `journey`, `king`, `kingdom`, `live action and animation`, `madness`, `magic`, `magical creature`, `melodramatic`, `obsession`, `power madness`, `powerful`, `quest`, `ring`, `sequel`, `sincere`, `split personality`, `sword and sorcery`, `trekking`, `volcano`, `wistful`, `wizard`, `wonder`, `wraith`
- *Keyword presenti nel Gruppo C (Scartate)*: `['intense']`

## [77] Il Signore degli Anelli - Le due torri (The Lord of the Rings: The Two Towers)
- **Verdetto**: **AMMESSO (✓)**
- **Regola determinante**: Passa sia la lista nera keyword sia la certificazione.
- **Tutte le keyword (31)**: `allegory`, `based on novel or book`, `bravery`, `castle`, `christ allegory`, `christ figure`, `christian allegory`, `christianity`, `companionship`, `dwarf`, `elves`, `epic battle`, `epic fantasy`, `evil spell`, `fantasy world`, `good versus evil`, `hero's journey`, `high fantasy`, `hobbit`, `journey`, `live action and animation`, `magic`, `mission`, `obsession`, `reincarnation`, `sequel`, `split personality`, `sword and sorcery`, `trekking`, `wizard`, `wraith`
