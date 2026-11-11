import type { MetadataRoute } from "next";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const today = new Date();

const docPages = [
  "",
  "/getting-started",
  "/how-it-works",
  "/models",
  "/custom-rules",
  "/analytics",
  "/billing",
  "/security",
  "/faq",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const docs = docPages.map((d) => `/docs${d}`);

  const entries: Array<{ path: string; priority: number; changeFrequency: "weekly" | "monthly" | "yearly" }> = [
    { path: "", priority: 1, changeFrequency: "weekly" },
    { path: "/features", priority: 0.9, changeFrequency: "monthly" },
    { path: "/pricing", priority: 0.9, changeFrequency: "monthly" },
    { path: "/team", priority: 0.7, changeFrequency: "monthly" },
    { path: "/support", priority: 0.8, changeFrequency: "monthly" },
    { path: "/login", priority: 0.5, changeFrequency: "yearly" },
    { path: "/terms", priority: 0.2, changeFrequency: "yearly" },
    { path: "/privacy", priority: 0.2, changeFrequency: "yearly" },
    ...docs.map((d) => ({ path: d, priority: d === "/docs" ? 0.9 : 0.7, changeFrequency: "monthly" as const })),
  ];

  return entries.map(({ path, priority, changeFrequency }) => ({
    url: `${appUrl}${path}`,
    lastModified: today,
    changeFrequency,
    priority,
  }));
}
