# YACA (Yet Another Catalog Addon)
Il catalogo definitivo per Stremio, potenziato dall'intelligenza artificiale di Mistral.

## Funzionalità
- **Cataloghi Intelligenti**: Genera cataloghi auto-aggiornanti con prompt testuali. (es. "Commedie romantiche natalizie").
## Setup Cloud Zero-Costi
Questo addon usa **Supabase** (PostgreSQL) come database cloud persistente gratuito per salvare le tue configurazioni senza doverti preoccupare di Docker o server.

1. Iscriviti gratis su [Supabase](https://supabase.com).
2. Crea un nuovo Progetto.
3. Nel SQL Editor di Supabase, esegui questa query per creare la tabella necessaria:
```sql
create table user_configs (
  uuid uuid primary key,
  "apiKeys" jsonb not null,
  catalogs jsonb default '[]',
  updated_at timestamp with time zone default timezone('utc'::text, now())
);
```
4. Vai nelle API Settings del tuo progetto Supabase e prendi `URL` e `anon public key`.
5. Rinomina il file `.env.example` interno del progetto in `.env`.
6. Compila il `.env` in questo modo:
```bash
SUPABASE_URL=https://tuo-id.supabase.co
SUPABASE_KEY=ey... (chiave anon public)
PORT=7000
```

## Avvio Server
```bash
npm install
npm run dev
```

Visita `http://localhost:7000` nel browser per configurare il tuo addon e ottenere il link personalizzato!
