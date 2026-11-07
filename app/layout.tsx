import type { ReactNode } from "react";
import { Cormorant_Garamond, Jost, Pinyon_Script } from "next/font/google";
import "./globals.css";

// Nagłówki — elegancki serif
const heading = Cormorant_Garamond({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  variable: "--font-heading",
});

// Tekst — Jost Light
const body = Jost({
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400", "500"],
  variable: "--font-body",
});

// Akcenty — pismo odręczne (Pinyon Script, podpis Maria-Luiza)
const accent = Pinyon_Script({
  subsets: ["latin", "latin-ext"],
  weight: "400",
  variable: "--font-accent",
});

export const metadata = {
  title: "Asystentka The Revival Atelier",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="pl"
      className={`${heading.variable} ${body.variable} ${accent.variable}`}
      suppressHydrationWarning
    >
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
