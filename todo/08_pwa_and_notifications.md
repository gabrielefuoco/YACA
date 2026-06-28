# 08 - PWA e Notifiche

Modernizzare l'interfaccia web di YACA trasformandola in una vera e propria applicazione e implementare logiche di retention (fidelizzazione) dell'utente.

## 1. Trasformazione in PWA (Progressive Web App)
**Azioni Dettagliate:**
- Generare il file `manifest.json` con le icone (per Android/iOS) e la configurazione del tema.
- Implementare i **Service Workers** per consentire il caching degli asset statici, migliorando drasticamente i tempi di caricamento e permettendo un utilizzo di base anche in caso di connessione instabile.
- Far comparire il prompt "Aggiungi alla schermata Home".

## 2. Sistema di Notifiche Proattive (Push Notifications)
**Descrizione:** Mantenere l'utente ingaggiato avvisandolo di nuovi contenuti rilevanti per lui.
**Azioni Dettagliate:**
- **Infrastruttura:** Integrare le Web Push API o un provider terzo (Firebase, OneSignal).
- **Nuove Uscite:** Se una serie tracciata su Trakt o presente in libreria riceve un nuovo episodio, inviare una notifica tempestiva.
- **Raccomandazioni:** Sistema a job pianificati (cronjob) che ogni X ore analizza i gusti dell'utente e spinge un suggerimento di visione mirato.
- **Deep Linking:** Configurare il payload della notifica in modo che il click avvii il protocollo URI nativo (es. `stremio://`) per aprire Stremio direttamente sul media suggerito.
