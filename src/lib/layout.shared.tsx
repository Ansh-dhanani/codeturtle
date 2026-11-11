import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { BrandMark } from "@/components/brand-mark";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className="flex items-center gap-2 font-bold tracking-tight">
          <BrandMark className="size-6" />
          <span>CodeTurtle</span>
        </span>
      ),
      url: "/",
      transparentMode: "top",
    },
    githubUrl: undefined,
  };
}
