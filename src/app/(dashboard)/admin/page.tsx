import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { getAdminOverview } from "@/module/admin/actions";
import { AdminDashboard } from "@/components/admin/admin-dashboard";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  // Gate: non-admins see a 404, not a hint that /admin exists.
  try {
    await requireAdmin();
  } catch {
    notFound();
  }

  const data = await getAdminOverview();

  return (
    <div className="px-4 py-6 md:px-6">
      <AdminDashboard data={data} />
    </div>
  );
}
