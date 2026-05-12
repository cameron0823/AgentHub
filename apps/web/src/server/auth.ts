import NextAuth, { type NextAuthOptions } from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "./db";
import { accounts, sessions, users, verificationTokens } from "./db/schema";

const casdoorIssuer = process.env.AUTH_CASDOOR_ISSUER || "http://localhost:8000";

export const authOptions: NextAuthOptions = {
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }) as any,
  providers: [
    {
      id: "casdoor",
      name: "Casdoor",
      type: "oauth",
      wellKnown: `${casdoorIssuer}/.well-known/openid-configuration`,
      authorization: {
        params: { scope: "openid profile email" },
      },
      idToken: true,
      checks: ["pkce", "state"],
      clientId: process.env.AUTH_CASDOOR_ID!,
      clientSecret: process.env.AUTH_CASDOOR_SECRET!,
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.name || profile.preferred_username || profile.sub,
          email: profile.email,
          image: profile.avatar,
          role: profile.role || "user",
        };
      },
    },
  ],
  callbacks: {
    async session({ session, user }) {
      if (user && session.user) {
        (session.user as any).id = user.id;
        (session.user as any).role = (user as any).role || "user";
      }
      return session;
    },
    async jwt({ token, user }) {
      if (user) {
        (token as any).id = user.id;
        (token as any).role = (user as any).role || "user";
      }
      return token;
    },
  },
  session: {
    strategy: "database",
  },
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },
};

const handler = NextAuth(authOptions);
export const GET = handler;
export const POST = handler;

// Server-side session helper for tRPC context
export async function auth() {
  const { getServerSession } = await import("next-auth/next");
  return getServerSession(authOptions);
}

// Client components should import signIn/signOut directly from "next-auth/react"
