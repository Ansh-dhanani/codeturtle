import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { QueryProvider } from "@/components/providers/query-provider";
import { Toaster } from "@/components/ui/sonner";
import { HydrationFix } from "@/components/hydration-fix";
import { Analytics } from "@vercel/analytics/next"
import { Umami } from "@/components/umami";
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-brand",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#050b1a" },
  ],
  colorScheme: "light dark",
};

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "CodeTurtle - Repository-aware AI Code Reviews for GitHub PRs",
    template: "%s | CodeTurtle",
  },
  icons: {
    icon: [
      { url: "/codeturtle-logo-light.svg", type: "image/svg+xml", media: "(prefers-color-scheme: light)" },
      { url: "/codeturtle-logo-dark.svg", type: "image/svg+xml", media: "(prefers-color-scheme: dark)" },
    ],
  },
  manifest: "/manifest.webmanifest",
  description:
    "CodeTurtle reads your diff and the code around it. Repository-aware AI reviews catch real bugs, security issues, and architectural problems before they reach production. Integrates with GitHub in under a minute.",
  keywords: [
    "AI code review",
    "code review bot",
    "GitHub PR review",
    "repository-aware",
    "CodeRabbit alternative",
    "automated code review",
    "code security scan",
  ],
  authors: [{ name: "CodeTurtle" }],
  creator: "CodeTurtle",
  publisher: "CodeTurtle",
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: "website",
    url: appUrl,
    title: "CodeTurtle - Repository-aware AI Code Reviews",
    description:
      "Repository-aware AI code reviews. Contextual findings. Fewer false positives. Connect your GitHub repo in under a minute.",
    siteName: "CodeTurtle",
    images: [
      {
        url: "/codeturtle-logo-dark.svg",
        width: 800,
        height: 468,
        alt: "CodeTurtle - AI Code Review",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "CodeTurtle - Repository-aware AI Code Reviews",
    description:
      "AI code reviews that read your entire repository, not just the diff. Fewer false positives. Connect your GitHub repo in a minute.",
    images: ["/codeturtle-logo-dark.svg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} antialiased`}
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
            <Umami />
            {children}
            <Toaster position="top-right"/>
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
