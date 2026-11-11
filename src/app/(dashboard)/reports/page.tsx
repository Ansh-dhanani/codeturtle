import { redirect } from "next/navigation";

/** Reports was merged into Analytics - keep old links working. */
export default function ReportsPage() {
  redirect("/analytics");
}
