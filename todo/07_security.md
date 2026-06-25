# 07 - Sicurezza e Crittografia

Rafforzare l'infrastruttura di YACA per proteggere i dati degli utenti (librerie, gusti, password) e prevenire abusi.

## 1. Gestione Token JWT
**Azioni Dettagliate:**
- Sostituire le vecchie logiche di autenticazione con **JSON Web Tokens (JWT)**.
- Prevedere un meccanismo di Access Token (a breve scadenza) e Refresh Token, per mantenere le sessioni valide in background senza gravare sull'utente.
- Configurare correttamente la firma (es. algoritmi HS256/RS256) e le chiavi segrete nell'ambiente di produzione.

## 2. Crittografia e Protezione Dati Generali
**Azioni Dettagliate:**
- **Hashing:** Qualsiasi informazione sensibile (es. password utente per frontend web, se previste, o token OAuth di Trakt/Debrid) deve essere crittografata a riposo nel database.
- **Sanitizzazione:** Usare librerie di validazione (es. Zod) su ogni singolo endpoint API per prevenire attacchi di iniezione NoSQL o XSS.
- **CORS e Headers:** Impostare stringenti regole CORS per l'accesso web e aggiungere header di sicurezza (Helmet) per proteggersi da vulnerabilità comuni.
