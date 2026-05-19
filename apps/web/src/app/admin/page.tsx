"use client";

import { AdminPanel } from "@/components/AdminPanel";
import { useSession } from "next-auth/react";

export default function AdminPage() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <div className="agenthub-page flex h-screen items-center justify-center text-muted-foreground">Loading…</div>
    );
  }

  if (!session?.user || (session.user as { role?: string }).role !== "admin") {
    return (
      <div className="agenthub-page flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Access denied. Admin role required.</p>
      </div>
    );
  }

  return (
    <div className="agenthub-page">
      <div className="agenthub-window mx-auto min-h-[calc(100vh-4rem)] max-w-6xl overflow-hidden">
        <AdminPanel />
      </div>
    </div>
  );
}
