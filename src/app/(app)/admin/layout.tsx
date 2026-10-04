import { requireUser } from "@/lib/auth";
import { requireAdminPage } from "@/lib/admin-server";

export const dynamic = "force-dynamic";

export default async function AdminSectionLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  await requireAdminPage(user);
  return children;
}
