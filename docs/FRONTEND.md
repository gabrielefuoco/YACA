# 🖥️ Frontend Architecture

L'interfaccia di configurazione di YACA è una Single Page Application (SPA) moderna costruita con **Next.js** (App Router) e **Tailwind CSS**. È progettata per essere veloce, reattiva e funzionare come "companion app" per l'addon Stremio.

## 1. Struttura del Progetto

La cartella `frontend/` segue le convenzioni di Next.js 14+:
- `src/app/`: Contiene le route principali (`page.tsx` è il punto d'ingresso).
- `src/components/`: Divisa per responsabilità (`layout`, `pages`, `ui`).
- `src/hooks/`: Gestione dello stato e logica riutilizzabile (`useAuth`, `useConfig`, `useProfiles`).
- `src/lib/`: Client API e utilità core (`api.ts`, `constants.ts`).

## 2. Gestione dello Stato e Persistenza

YACA utilizza uno stato ibrido per garantite velocità e affidabilità:

### Persistenza Locale (Browser)
- **`localStorage`**: Utilizzato per dati persistenti come il `userId` (ID corto), le liste salvate dall'utente e i token Trakt.
- **`sessionStorage`**: Usato per stati transitori, come il profilo attivo durante una sessione di modifica.

### Sincronizzazione API
Quando l'utente modifica una configurazione:
1. Lo stato React viene aggiornato istantaneamente (UI ottimistica).
2. Viene inviata una richiesta `POST /api/configure`.
3. Il backend restituisce un URL manifest aggiornato (stateful).
4. La SPA aggiorna automaticamente la collezione addon in Stremio tramite l'API `addonCollectionSet`.

## 3. Flusso di Login ed Onboarding

1. **Auto-Login**: Se l'utente apre il link di configurazione direttamente da Stremio, la SPA tenta di recuperare l'ID utente dal path URL.
2. **Reconcilation**: In fase di login (Stremio/Trakt), il frontend comunica con il backend per "riconoscere" l'utente tramite Email o API Key, ripristinando profili e preferenze precedenti.

## 4. Design System

L'estetica di YACA è definita da:
- **Dark Mode Nativa**: Colori scuri profondi con accenti viola/indigo.
- **Glassmorphism**: Pannelli semi-trasparenti e sfocature di sfondo.
- **Animazioni Micro-Interattive**: Feedback visivo immediato su salvataggi, cancellazioni e toggle.
- **Responsive Design**: Ottimizzato sia per desktop (configurazione granulare) che per mobile (installazione veloce).

---

## 5. Mobile & Desktop Bridge

YACA implementa un sistema di installazione "One-Click":
Se viene rilevato un utente loggato su Stremio, il frontend genera un URL `stremio://` o utilizza l'API di sync per iniettare l'addon direttamente nella libreria dell'utente senza richiedere il copia-incolla manuale del manifest.
