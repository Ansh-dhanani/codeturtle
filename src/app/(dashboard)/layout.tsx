import { DashboardShell } from "@/components/dashboard-shell";
import { Spinner } from "@/components/ui/spinner";
import { Suspense } from "react";
import { requireAuth } from "@/lib/auth-utils";
import { isAdminUser } from "@/lib/admin";

export const dynamic = 'force-dynamic';

export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await requireAuth();
  const isAdmin = await isAdminUser(session.user.id);

  return (
    <DashboardShell isAdmin={isAdmin}>
      <Suspense fallback={
        <div className="flex items-center justify-center w-full h-32">
          <Spinner />
        </div>
      }>
        {children}
      </Suspense>
    </DashboardShell>
  );
}
