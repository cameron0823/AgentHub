"use client";

import { AdminPanel } from "@/components/AdminPanel";
import { useSession } from "next-auth/react";

export default function AdminPage() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return <div className="flex h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  }

  if (!session?.user || (session.user as { role?: string }).role !== "admin") {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Access denied. Admin role required.</p>
      </div>
    );
  }

  return <AdminPanel />;
}
