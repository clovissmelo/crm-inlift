import { requireUser } from "@/lib/auth";
import { requireAdminPage } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function AdminSectionLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  requireAdminPage(user);
  return children;
}
