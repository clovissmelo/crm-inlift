import { ProfileForm } from "@/components/profile-form";
import { requireUser } from "@/lib/auth";
import { getUserById } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function PerfilPage() {
  const session = await requireUser();
  const user = (await getUserById(session.id)) ?? session;
  return <ProfileForm user={user} />;
}
