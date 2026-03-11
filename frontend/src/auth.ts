/**
 * Configurazione NextAuth.js per YACA.
 *
 * Architettura:
 *   - CredentialsProvider: valida le credenziali utente contro le API ufficiali di Stremio
 *   - Sessione JWT: cookie HttpOnly firmato e cifrato con NEXTAUTH_SECRET
 *   - Nessuno stato server-side: il backend Express è completamente stateless
 *   - Il salvataggio utente avviene tramite chiamata HTTP interna al backend Express
 *
 * Variabili d'ambiente richieste:
 *   - NEXTAUTH_SECRET: Chiave crittografica per firmare/cifrare i JWT (generare con: openssl rand -base64 32)
 *   - NEXTAUTH_URL: URL canonico dell'applicazione (es. https://nome-spazio.hf.space)
 */

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

/**
 * Accede al modulo UserConfig del backend Express.
 * Funziona perché Next.js e Express girano nello stesso processo Node
 * grazie al custom server (server.js). Il require è lazy (runtime-only)
 * per evitare errori durante il build di Next.js.
 */
function getUserConfig() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(/* webpackIgnore: true */ '../../../../src/models/UserConfig');
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/",  // La LoginPage è nella root
  },
  providers: [
    Credentials({
      name: "Stremio",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Email e password obbligatorie");
        }

        // 1. Validazione credenziali contro le API ufficiali di Stremio (Single Source of Truth)
        const stremioRes = await fetch("https://api.strem.io/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: credentials.email,
            password: credentials.password,
          }),
        });

        const stremioData = await stremioRes.json();

        if (!stremioData?.result?.authKey) {
          throw new Error(stremioData?.result?.error || "Credenziali Stremio non valide");
        }

        const authKey = stremioData.result.authKey;
        const userEmail = stremioData.result.user?.email || credentials.email;

        // 2. Salvataggio sicuro tramite il modulo Mongoose (applica encryption + hash + riconciliazione)
        //    Il require è lazy per funzionare sia a build-time che a runtime
        const UserConfig = getUserConfig();
        const { user: userDoc, isNewUser } = await UserConfig.saveUser({
          apiKeys: { stremio: authKey, stremioPass: credentials.password as string },
          email: userEmail,
        });

        // 3. Ritorno dei dati essenziali al JWT di NextAuth
        //    NOTA: Non includere MAI chiavi API in chiaro nel token JWT
        return {
          id: userDoc.userId,
          email: userEmail,
          isNewUser,
          traktToken: userDoc.apiKeys?.trakt || null,
          traktRefreshToken: userDoc.apiKeys?.traktRefreshToken || null,
          profiles: userDoc.profiles || [],
          activeProfileId: userDoc.config?.activeProfileId || "global",
        };
      },
    }),
  ],
  callbacks: {
    /**
     * Callback JWT: inietta i dati custom nel token JWT cifrato.
     * Viene chiamato ad ogni creazione/aggiornamento del token.
     */
    async jwt({ token, user }) {
      if (user) {
        // Primo login: inietta i dati dell'utente nel token
        token.userId = (user as any).id;
        token.isNewUser = (user as any).isNewUser;
        token.traktToken = (user as any).traktToken;
        token.traktRefreshToken = (user as any).traktRefreshToken;
        token.profiles = (user as any).profiles;
        token.activeProfileId = (user as any).activeProfileId;
      }
      return token;
    },

    /**
     * Callback Session: espone i dati necessari al frontend via useSession().
     * I dati qui sono leggibili dal client React.
     * NOTA: Non esporre MAI chiavi API o dati sensibili.
     */
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).userId = token.userId;
        (session.user as any).isNewUser = token.isNewUser;
        (session.user as any).traktToken = token.traktToken;
        (session.user as any).traktRefreshToken = token.traktRefreshToken;
        (session.user as any).profiles = token.profiles;
        (session.user as any).activeProfileId = token.activeProfileId;
      }
      return session;
    },
  },
});
