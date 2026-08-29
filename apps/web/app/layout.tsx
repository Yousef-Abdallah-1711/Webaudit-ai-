import type { Metadata } from 'next';
import { JetBrains_Mono, Lexend_Deca } from 'next/font/google';
import { ThemeScript } from './theme';
import './globals.css';

/**
 * T236a / T127 — self-hosted fonts.
 *
 * `next/font/google` downloads the font files at build time and serves them
 * from this app's own origin; nothing is fetched from Google at runtime. Each
 * loader's `variable` becomes a CSS custom property, applied here as a class
 * on `<html>` so it is available to every ported surface — `app/tokens/fonts.css`
 * reads `--font-lexend-deca`/`--font-jetbrains-mono` into `--font-sans`/`--font-mono`,
 * which is what every component actually uses.
 *
 * `display: 'swap'` matches the vendored `fonts.css`'s own `&display=swap`.
 */
const lexendDeca = Lexend_Deca({
  subsets: ['latin'],
  weight: ['100', '200', '300', '400', '500', '600', '700', '800', '900'],
  variable: '--font-lexend-deca',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'WebAudit AI',
  description: 'An honest audit of your software.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.ReactElement {
  return (
    <html
      lang="en"
      className={`${lexendDeca.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/*
         * T248 — applies `wa-theme`/`wa-lang` from localStorage before first
         * paint. `suppressHydrationWarning` above covers the `lang`/`dir`
         * attributes this script may overwrite ahead of hydration; the theme
         * component's own store re-derives the same value once the client
         * bundle runs, so this is a same-frame no-op, not a second flip.
         */}
        <ThemeScript />
      </head>
      <body>{children}</body>
    </html>
  );
}
