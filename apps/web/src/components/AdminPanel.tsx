"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Users, BarChart3, ShieldCheck, ShieldOff } from "lucide-react";

type AdminTab = "users" | "stats";

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card p-5 flex flex-col gap-1">
      <div className="text-2xl font-semibold tabular-nums">{value.toLocaleString()}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

function UsersTab() {
  const utils = trpc.useUtils();
  const { data: userList = [], isLoading } = trpc.admin.users.list.useQuery();
  const setRole = trpc.admin.users.setRole.useMutation({
    onSuccess: () => utils.admin.users.list.invalidate(),
  });

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading…</div>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-muted-foreground text-left">
            <th className="pb-2 pr-4 font-medium">Name</th>
            <th className="pb-2 pr-4 font-medium">Email</th>
            <th className="pb-2 pr-4 font-medium">Role</th>
            <th className="pb-2 pr-4 font-medium">Joined</th>
            <th className="pb-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {userList.map((u) => (
            <tr key={u.id} className="group">
              <td className="py-2.5 pr-4">{u.name ?? "—"}</td>
              <td className="py-2.5 pr-4 text-muted-foreground">{u.email}</td>
              <td className="py-2.5 pr-4">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                    u.role === "admin"
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {u.role === "admin" ? <ShieldCheck className="w-3 h-3" /> : <ShieldOff className="w-3 h-3" />}
                  {u.role}
                </span>
              </td>
              <td className="py-2.5 pr-4 text-muted-foreground">
                {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
              </td>
              <td className="py-2.5">
                <button
                  onClick={() =>
                    setRole.mutate({ userId: u.id, role: u.role === "admin" ? "user" : "admin" })
                  }
                  disabled={setRole.isPending}
                  className="text-xs px-2 py-1 rounded border hover:bg-muted transition-colors disabled:opacity-50"
                >
                  {u.role === "admin" ? "Revoke admin" : "Make admin"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {userList.length === 0 && (
        <p className="py-8 text-center text-muted-foreground">No users found.</p>
      )}
    </div>
  );
}

function StatsTab() {
  const { data: stats, isLoading } = trpc.admin.stats.overview.useQuery();

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading…</div>;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      <StatCard label="Total users" value={stats?.users ?? 0} />
      <StatCard label="Agents" value={stats?.agents ?? 0} />
      <StatCard label="Chat sessions" value={stats?.sessions ?? 0} />
      <StatCard label="Messages" value={stats?.messages ?? 0} />
      <StatCard label="Tasks" value={stats?.tasks ?? 0} />
    </div>
  );
}

export function AdminPanel() {
  const [tab, setTab] = useState<AdminTab>("users");

  return (
    <div className="flex-1 flex flex-col min-h-0 p-6 max-w-5xl mx-auto w-full">
      <h1 className="text-xl font-semibold mb-4">Admin Panel</h1>

      <div className="flex gap-1 mb-6 border-b">
        {(["users", "stats"] as AdminTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "users" ? <Users className="w-3.5 h-3.5" /> : <BarChart3 className="w-3.5 h-3.5" />}
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === "users" ? <UsersTab /> : <StatsTab />}
    </div>
  );
}
