# YACA Frontend

## Regola Architetturale: Il client nomina solo il dominio (Ticket 11)

Il frontend non nomina mai l'infrastruttura del server:
- **Nessuna rotta infrastrutturale**: vietati `/api/tmdb/*`, `/api/sync/*`, `/api/validate-*`, `/api/clear-cache`, `/api/profiles/:id/*`.
- **Rotte di dominio**: tutte le chiamate passano esclusivamente tramite `frontend/src/lib/api.ts` e usano le risorse di dominio (`/api/profilo`, `/api/configurazione`, `/api/ricerca`, `/api/mondi`, `/api/auth/*`).
- **Nessun `userId`**: l'identità dell'utente è veicolata dal cookie di sessione HttpOnly gestito dal server. Nessun `userId` viaggia in query o body.
- **Perché**: evitare che il client torni a diventare un orchestratore di servizi esterni o di pipeline complesse. Il client esprime intenzioni di presentazione; il server compone e orchestra i dati.

Questa regola è presidiata dal test automatico `tests/clientDomainGuard.test.js`.

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
