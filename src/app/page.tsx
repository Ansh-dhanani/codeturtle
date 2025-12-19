import { ThemeToggleWrapper } from "@/components/ui/shadcn-io/theme-toggle-button/theme-toggle-wrapper";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-24">
    hi 
    <ThemeToggleWrapper variant="circle" start="top-right" />
    </div>
  );
}
