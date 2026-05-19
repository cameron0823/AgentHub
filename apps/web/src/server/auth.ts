import NextAuth, { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { accounts, sessions, users, verificationTokens } from "./db/schema";

const casdoorIssuer = process.env.AUTH_CASDOOR_ISSUER || "http://localhost:8000";
const isDev =
  process.env.NODE_ENV === "development" ||
  process.env.AGENTHUB_ENABLE_DEV_LOGIN === "1" ||
  process.env.E2E_ENABLE_DEV_LOGIN === "1";

function getAllowedRedirectBase(baseUrl: string) {
  return process.env.AGENTHUB_DESKTOP_ORIGIN || process.env.NEXTAUTH_URL || baseUrl;
}

export const authOptions: NextAuthOptions = {
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }) as any,
  providers: [
    // Dev-only credentials provider — auto-creates user on first sign-in
    ...(isDev
      ? [
          CredentialsProvider({
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
          }),
        ]
      : []),
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
    async redirect({ url, baseUrl }) {
      const allowedBase = getAllowedRedirectBase(baseUrl);
      if (url.startsWith("/")) {
        return `${allowedBase}${url}`;
      }

      try {
        const targetUrl = new URL(url);
        const allowedUrl = new URL(allowedBase);
        if (targetUrl.origin === allowedUrl.origin) {
          return url;
        }
      } catch {
        return allowedBase;
      }

      return allowedBase;
    },
    async session({ session, token, user }) {
      if (user && session.user) {
        (session.user as any).id = user.id;
        (session.user as any).role = (user as any).role || "user";
      } else if (token && session.user) {
        (session.user as any).id = (token as any).id as string;
        (session.user as any).role = (token as any).role || "user";
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

// Server-side session helper for tRPC context.
// Uses getToken() instead of getServerSession() to avoid Next.js 15's async cookies()
// incompatibility — getServerSession() internally calls synchronous cookies() which throws
// in Next.js 15 App Router when a session cookie is present.
export async function auth(headers?: Headers) {
  const { getToken } = await import("next-auth/jwt");
  const cookieHeader = headers?.get("cookie") ?? "";
  const cookies: Record<string, string> = {};
  cookieHeader.split(";").forEach((pair) => {
    const eqIdx = pair.indexOf("=");
    if (eqIdx === -1) return;
    const k = pair.slice(0, eqIdx).trim();
    const v = pair.slice(eqIdx + 1).trim();
    if (k) cookies[k] = decodeURIComponent(v);
  });
  const req = {
    headers: headers ? Object.fromEntries(headers.entries()) : {},
    cookies,
  } as any;
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) return null;
  return {
    user: {
      id: token.id as string,
      email: token.email as string,
      name: token.name as string,
      role: ((token as any).role as string) || "user",
    },
    expires: new Date(((token.exp as number) ?? 0) * 1000).toISOString(),
  };
}

export { authOptions as config };

// Client components should import signIn/signOut directly from "next-auth/react"
