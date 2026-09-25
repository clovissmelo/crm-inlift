import { ProfileForm } from "@/components/profile-form";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function PerfilPage() {
  const user = await requireUser();
  return <ProfileForm user={user} />;
}
