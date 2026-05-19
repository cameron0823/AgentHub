"use client";

import { useEffect } from "react";

type TrustedTypesLike = {
  createPolicy: (
    name: string,
    rules: {
      createScriptURL: (value: string) => string;
    },
  ) => {
    createScriptURL: (value: string) => unknown;
  };
};

let serviceWorkerPolicy: ReturnType<TrustedTypesLike["createPolicy"]> | null = null;

function getServiceWorkerScriptUrl() {
  const trustedTypes = (globalThis as typeof globalThis & { trustedTypes?: TrustedTypesLike }).trustedTypes;
  if (!trustedTypes) return "/sw.js";

  serviceWorkerPolicy ??= trustedTypes.createPolicy("agenthub-service-worker", {
    createScriptURL(value) {
      if (value !== "/sw.js") throw new TypeError("Unexpected service worker script URL");
      return value;
    },
  });
  return serviceWorkerPolicy.createScriptURL("/sw.js") as string;
}

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      try {
        navigator.serviceWorker.register(getServiceWorkerScriptUrl()).catch(() => {
          // SW registration is best-effort; silently ignore failures.
        });
      } catch {
        // A restrictive Trusted Types policy should not break the app shell.
      }
    }
  }, []);

  return null;
}
