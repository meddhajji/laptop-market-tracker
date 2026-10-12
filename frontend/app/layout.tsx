import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme";
import { Navbar } from "@/components/navbar";
import { Analytics } from "@vercel/analytics/next";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Laptop Market Tracker",
  description: "Every laptop listed for sale in Morocco, updated daily: specs extracted by AI, a fair-price estimate for each one and an assistant to search them.",
  openGraph: {
    title: "Laptop Market Tracker",
    description: "Every laptop listed for sale in Morocco, updated daily: specs extracted by AI, a fair-price estimate for each one and an assistant to search them.",
    type: "website",
    locale: "en_US",
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full dark">
      <body className={`${inter.variable} font-sans antialiased h-full`} suppressHydrationWarning>
        <ThemeProvider>
          <div className="flex flex-col h-full overflow-hidden">
            <Navbar />
            <main className="flex-1 overflow-hidden relative border-none outline-none">
              {children}
            </main>
            <footer className="shrink-0 px-4 pt-1 pb-[calc(0.375rem+env(safe-area-inset-bottom))] text-center text-[11px] leading-4 text-muted-foreground/70">
              Independent project, not affiliated with Avito.ma. Listings belong to their sellers and link to the original ads.
            </footer>
          </div>
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  );
}
