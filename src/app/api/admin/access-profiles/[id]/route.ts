import { deleteBlockedMessage, requireAdminApi } from "@/lib/admin";
import { requireApiUser } from "@/lib/auth";
import { deleteAccessProfile, getAccessProfile } from "@/lib/access-profiles";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  const user = await requireApiUser();
  const denied = requireAdminApi(user);
  if (denied) return denied;

  const { id } = await params;
  const profileId = Number(id);
  const existing = await getAccessProfile(profileId);
  if (!existing) return Response.json({ error: "Não encontrado" }, { status: 404 });

  try {
    await deleteAccessProfile(profileId);
  } catch (err) {
    return Response.json({ error: deleteBlockedMessage(err) }, { status: 409 });
  }
  return Response.json({ ok: true });
}
