import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return {
    rules: [
      { userAgent: "*", allow: ["/", "/features", "/pricing", "/team", "/docs", "/support", "/login", "/terms", "/privacy"], disallow: ["/dashboard", "/settings", "/billing", "/account", "/notifications", "/repositories", "/reviews", "/analytics", "/api/"] },
      { userAgent: "GPTBot", disallow: "/" },
      { userAgent: "CCBot", disallow: "/" },
      { userAgent: "Google-Extended", disallow: "/" },
    ],
    sitemap: `${appUrl}/sitemap.xml`,
  };
}
