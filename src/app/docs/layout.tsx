import { RootProvider } from "fumadocs-ui/provider/next";
import { source } from "@/lib/source";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { baseOptions } from "@/lib/layout.shared";
import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Documentation", template: "%s — CodeTurtle Docs" },
  description:
    "How CodeTurtle reviews your pull requests: GitHub App setup, models, custom rules, billing, and analytics.",
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <RootProvider>
      <div className="min-h-dvh flex flex-col">
        <div className="flex-1 flex flex-col">
          <DocsLayout tree={source.getPageTree()} {...baseOptions()}>
            {children}
          </DocsLayout>
        </div>
      </div>
    </RootProvider>
  );
}
