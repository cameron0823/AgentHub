"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { SessionProvider } from "next-auth/react";
import superjson from "superjson";
import { sanitizeArtifactHtml } from "@/lib/security/sanitize";

type TrustedTypesLike = {
  createPolicy: (name: string, rules: { createHTML: (value: string) => string }) => unknown;
};

let trustedTypesDefaultPolicyInstalled = false;

function installTrustedTypesDefaultPolicy() {
  if (trustedTypesDefaultPolicyInstalled) return;
  trustedTypesDefaultPolicyInstalled = true;
  const trustedTypes = (globalThis as typeof globalThis & { trustedTypes?: TrustedTypesLike }).trustedTypes;
  if (!trustedTypes) return;

  try {
    trustedTypes.createPolicy("default", {
      createHTML: (value) => sanitizeArtifactHtml(value),
    });
  } catch {
    // Another client bundle already installed the default policy.
  }
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: "/api/trpc",
          transformer: superjson,
          maxItems: 1,
        }),
      ],
    }),
  );

  useEffect(() => {
    installTrustedTypesDefaultPolicy();
  }, []);

  return (
    <SessionProvider>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </trpc.Provider>
    </SessionProvider>
  );
}
