import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { QueryProvider } from "@/components/providers/query-provider";
import { Toaster } from "@/components/ui/sonner";
import { HydrationFix } from "@/components/hydration-fix";
import { Analytics } from "@vercel/analytics/next"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** 
 * Root layout metadata for SEO and page information.
 * This metadata applies to the entire application and is used by search engines
 * and social media platforms to display page information.
 */
export const metadata: Metadata = {
  title: "CodeTurtle", // Browser tab title and primary heading for SEO
  description: "Learn to code with CodeTurtle", // Meta description for search engines
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body 
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <HydrationFix />
        <QueryProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <Analytics />
            {children}
            <Toaster position="top-right"/>
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
