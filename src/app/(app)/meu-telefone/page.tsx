import { MeuTelefoneForm } from "@/components/meu-telefone-form";
import { requireUser } from "@/lib/auth";
import { getUserById } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function MeuTelefonePage() {
  const session = await requireUser();
  const user = (await getUserById(session.id)) ?? session;
  return <MeuTelefoneForm user={user} />;
}
