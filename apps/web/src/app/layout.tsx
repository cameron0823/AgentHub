import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import "katex/dist/katex.min.css";
import { Providers } from "@/components/Providers";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import { AppRouteFrame } from "@/components/AppRouteFrame";
import { NextIntlClientProvider } from "next-intl";
import { headers } from "next/headers";
import { getLocale, getMessages } from "next-intl/server";
import { getLocaleDirection, type Locale } from "@/i18n/config";

export const metadata: Metadata = {
  title: "AgentHub - Local AI Agent Platform",
  description:
    "Find, build, and collaborate with agent teammates that grow with you. Fully self-hosted, privacy-preserving, zero API cost.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang={locale}
      dir={getLocaleDirection(locale as Locale)}
      className={`dark ${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#09090b" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        {/* Inline script runs before React hydration - no flash of persisted theme settings */}
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var key='agenthub-theme-settings';var raw=localStorage.getItem(key);var legacy=localStorage.getItem('theme');var settings=raw?JSON.parse(raw):{};var theme=['light','dark','system'].indexOf(settings.theme)>-1?settings.theme:(legacy==='light'||legacy==='dark'||legacy==='system'?legacy:'dark');var accent=['blue','cyan','emerald','amber','rose'].indexOf(settings.accentPalette)>-1?settings.accentPalette:'blue';var layout=['chat','document'].indexOf(settings.layoutMode)>-1?settings.layoutMode:'chat';var prefersDark=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;var resolved=theme==='system'?(prefersDark?'dark':'light'):theme;var root=document.documentElement;root.classList.remove('light','dark');root.classList.add(resolved==='light'?'light':'dark');root.dataset.agenthubAccent=accent;root.dataset.agenthubLayout=layout;}catch(e){}})()`,
          }}
        />
      </head>
      <body className={GeistSans.className}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider>
            <Providers>
              <AppRouteFrame>{children}</AppRouteFrame>
            </Providers>
          </ThemeProvider>
        </NextIntlClientProvider>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
