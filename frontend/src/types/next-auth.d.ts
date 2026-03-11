/* eslint-disable @typescript-eslint/no-unused-vars */
import { DefaultSession, DefaultUser } from "next-auth";
import { DefaultJWT } from "next-auth/jwt";

/**
 * Estensione dei tipi NextAuth per includere i campi custom di YACA.
 * Elimina la necessità di cast `as any` nel codice.
 */
declare module "next-auth" {
  interface User extends DefaultUser {
    userId?: string;
    isNewUser?: boolean;
    traktToken?: string | null;
    traktRefreshToken?: string | null;
    profiles?: any[];
    activeProfileId?: string;
  }

  interface Session {
    user: {
      userId: string;
      email: string;
      isNewUser: boolean;
      traktToken: string | null;
      traktRefreshToken: string | null;
      profiles: any[];
      activeProfileId: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    userId?: string;
    isNewUser?: boolean;
    traktToken?: string | null;
    traktRefreshToken?: string | null;
    profiles?: any[];
    activeProfileId?: string;
  }
}
