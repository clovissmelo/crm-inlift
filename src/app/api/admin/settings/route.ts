import { requireAdminApi } from "@/lib/admin";
import { requireApiUser } from "@/lib/auth";
import { listSystemSettingsForAdmin, updateSystemSettings } from "@/lib/system-settings";
import { z } from "zod";

const patchSchema = z.object({
  settings: z.array(
    z.object({
      key: z.string().min(1),
      value: z.string().nullable()
    })
  )
});

export async function GET() {
  const user = await requireApiUser();
  const denied = await requireAdminApi(user);
  if (denied) return denied;
  const settings = await listSystemSettingsForAdmin();
  const safe = settings.map((s) => ({
    ...s,
    value: s.is_secret && s.value ? "••••••••" : s.value,
    has_value: Boolean(s.value)
  }));
  return Response.json({ settings: safe });
}

export async function PATCH(request: Request) {
  const user = await requireApiUser();
  const denied = await requireAdminApi(user);
  if (denied) return denied;
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  const updates = parsed.data.settings.filter((s) => s.value !== "••••••••");
  await updateSystemSettings(updates, user!.id);
  return Response.json({ ok: true });
}
