import NextAuth, { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { accounts, sessions, users, verificationTokens } from "./db/schema";

const casdoorIssuer = process.env.AUTH_CASDOOR_ISSUER || "http://localhost:8000";
const isDev = process.env.NODE_ENV === "development";

export const authOptions: NextAuthOptions = {
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }) as any,
  providers: [
    // Dev-only credentials provider — auto-creates user on first sign-in
    ...(isDev ? [CredentialsProvider({
      id: "dev-credentials",
      name: "Dev Login",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "admin@localhost" },
        password: { label: "Password", type: "password", placeholder: "any" },
      },
      async authorize(credentials) {
        if (!credentials?.email) return null;
        const email = credentials.email.trim().toLowerCase();
        let [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
        if (!user) {
          const [created] = await db
            .insert(users)
            .values({ email, name: email.split("@")[0], role: "admin" })
            .returning();
          user = created;
        }
        return { id: user.id, email: user.email!, name: user.name, role: (user as any).role };
      },
    })] : []),
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
    strategy: isDev ? "jwt" : "database",
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

export { authOptions as config };

// Client components should import signIn/signOut directly from "next-auth/react"
