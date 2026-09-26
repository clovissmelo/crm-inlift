import { run } from "@/lib/db";
import { assertExtensionUnique } from "@/lib/api4com/calls";
import type { UserRole } from "@/lib/types";

export async function applyUserApi4comExtension(userId: number, roles: UserRole[], extension: string | null | undefined) {
  if (!roles.includes("bdr")) {
    await run("UPDATE users SET api4com_extension = NULL WHERE id = @id", { id: userId });
    return;
  }
  const ext = extension?.trim() || null;
  if (ext) await assertExtensionUnique(ext, userId);
  await run("UPDATE users SET api4com_extension = @ext WHERE id = @id", { ext, id: userId });
}
