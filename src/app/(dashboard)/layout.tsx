import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { Suspense } from "react";
import Navbar from "@/components/navbar";
import { requireAuth } from "@/lib/auth-utils";

export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireAuth();

  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="w-full h-full">
        <Navbar />
        <div className="container p-8">
          <div className="max-w-2xl">
            <Suspense fallback={
              <div className="flex items-center justify-center w-full h-32">
                <Spinner />
              </div>
            }>
              {children}
            </Suspense>
          </div>
        </div>
      </main>
    </SidebarProvider>
  );
}
