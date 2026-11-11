import type { MetadataRoute } from "next";

const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CodeTurtle — Repository-aware AI Code Reviews for GitHub PRs",
    short_name: "CodeTurtle",
    description:
      "Repository-aware AI code reviews for GitHub pull requests. Fewer false positives, actionable findings, and full repository context on every review.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#050b1a",
    icons: [
      { src: "/web-app-manifest-192x192.png", sizes: "192x192", type: "image/png" },
      { src: "/web-app-manifest-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
    categories: ["developer tools", "productivity", "software"],
    lang: "en",
  };
}
