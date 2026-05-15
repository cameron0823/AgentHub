"use client";

/* eslint-disable @next/next/no-img-element -- Provider avatars come from arbitrary auth providers outside next/image remotePatterns. */

import { useSession, signIn, signOut } from "next-auth/react";
import { User, LogIn, LogOut } from "lucide-react";

export function UserNav() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
        <div className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
        Loading...
      </div>
    );
  }

  if (!session?.user) {
    return (
      <button
        onClick={() => signIn("casdoor")}
        className="flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors w-full text-left"
      >
        <LogIn className="w-4 h-4" />
        Sign In
      </button>
    );
  }

  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-2 mb-2">
        {session.user.image ? (
          <img src={session.user.image} alt="" className="w-6 h-6 rounded-full" />
        ) : (
          <User className="w-5 h-5 text-muted-foreground" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{session.user.name || session.user.email}</p>
          <p className="text-xs text-muted-foreground truncate">{session.user.email}</p>
        </div>
      </div>
      <button
        onClick={() => signOut()}
        className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-md hover:bg-accent transition-colors w-full text-left text-muted-foreground hover:text-foreground"
      >
        <LogOut className="w-4 h-4" />
        Sign Out
      </button>
    </div>
  );
}
