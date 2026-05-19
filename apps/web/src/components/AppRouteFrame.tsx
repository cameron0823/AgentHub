"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart2, BookOpen, Code2, FileText, Folder, GitBranch, Home, ListTodo, Settings, Zap } from "lucide-react";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

const standaloneRoutePrefixes = [
  "/projects",
  "/pages",
  "/code",
  "/kb",
  "/analytics",
  "/automations",
  "/tasks",
  "/review",
  "/settings",
  "/admin",
];

const navItems = [
  { href: "/projects", label: "Projects", icon: Folder },
  { href: "/pages", label: "Pages", icon: FileText },
  { href: "/code", label: "Code", icon: Code2 },
  { href: "/kb", label: "Knowledge", icon: BookOpen },
  { href: "/analytics", label: "Analytics", icon: BarChart2 },
  { href: "/automations", label: "Automations", icon: Zap },
  { href: "/tasks", label: "Tasks", icon: ListTodo },
  { href: "/review", label: "Review", icon: GitBranch },
  { href: "/settings", label: "Settings", icon: Settings },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function RouteNavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: typeof Home;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-sm transition-colors ${
        active
          ? "bg-white/15 text-white shadow-inner shadow-white/5"
          : "text-slate-300 hover:bg-white/10 hover:text-white"
      }`}
      aria-current={active ? "page" : undefined}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

export function AppRouteFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showPersistentNav = standaloneRoutePrefixes.some((prefix) => isActive(pathname, prefix));

  if (!showPersistentNav) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <header
        data-testid="persistent-route-nav"
        className="z-40 flex h-14 shrink-0 items-center gap-2 border-b border-white/10 bg-slate-950/90 px-2 shadow-lg shadow-black/20 backdrop-blur-xl sm:px-3 md:px-4"
      >
        <Link
          href="/"
          data-testid="persistent-home-link"
          className="agenthub-primary-button inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium"
        >
          <Home className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">Home</span>
        </Link>
        <nav aria-label="AgentHub sections" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {navItems.map((item) => (
            <RouteNavLink
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={isActive(pathname, item.href)}
            />
          ))}
        </nav>
        <div className="hidden min-w-0 sm:block">
          <WorkspaceSwitcher />
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}
