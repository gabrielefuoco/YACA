Status: resolved
Type: task
Blocked by: 01

# 02 — F1: contratto di larghezza (desktop e mobile)

## Perché
Non esiste un contratto di larghezza. Su desktop i contenuti si dilatano fino a riempire i 1200px del
contenitore (form di login e impostazioni: input e box larghi ~1120px, verificato a video); su mobile i
casi che non stanno nelle 360px non si correggono, si nascondevano — e fino al ticket 01 non si
vedevano nemmeno. (`report.md` §R1, screenshot in `screens/`)

## Cosa fare
1. **Pagine a colonna singola**: vincolare il contenuto invece di allargarlo.
   - `frontend/src/components/pages/LoginPage.tsx:122` — wrapper `max-w-md mx-auto w-full`.
   - `frontend/src/components/pages/SettingsPage.tsx:133` — `max-w-2xl mx-auto`, oppure
     `lg:grid lg:grid-cols-2 lg:gap-6` se si vuole sfruttare la larghezza su desktop.
2. **Righe che collidono a 360px** — `flex-wrap` o impilamento (`flex-col sm:flex-row`), **mai** testo
   più piccolo:
   - `components/dashboard/ActiveCatalogsPanel.tsx:92-108` (titolo + pillola "Frecce per riordinare")
   - `components/dashboard/DnaAndAiPanel.tsx:319` (titolo + switch FILM/SERIE), `:363` (Alien Ratio)
   - `components/dashboard/ExplorePanel.tsx:165` — il motivo di incompatibilità va **sotto** il titolo
     quando è lungo, invece di comprimere il titolo a <140px
   - `components/pages/SettingsPage.tsx:254-256` — `min-w-0` sul wrapper, `truncate` sull'email,
     `shrink-0` sul pallino di stato
3. **Scroll orizzontale esplicito dove deve esistere**: `components/layout/TabNav.tsx:16`
   (`overflow-x-auto no-scrollbar`).

## Done quando
- a 1440px nessun blocco di testo supera ~800px di misura;
- a 360px nessuna riga manda contenuto fuori schermo (harness: zero elementi oltre il bordo);
- nessun titolo troncato a metà parola a 360/390/768.

## Verifica
`node C:/tmp/measure.mjs http://localhost:3000 / 360 390 768 1024 1440`, più un giro occhio sugli
screenshot (`SHOTS=1 SHOT_DIR=...`) su `/` (login) e sulle tab dashboard con backend attivo.
