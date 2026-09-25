import fs from "node:fs/promises";
import path from "node:path";
import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { run } from "@/lib/db";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();

  const form = await request.formData();
  const file = form.get("photo");
  if (!(file instanceof File)) {
    return Response.json({ error: "Arquivo não enviado" }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return Response.json({ error: "Use JPG, PNG ou WebP" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "Arquivo acima de 5 MB" }, { status: 400 });
  }

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const fileName = `user-${user.id}-${Date.now()}.${ext}`;
  const dir = path.join(process.cwd(), "public", "uploads", "avatars");
  await fs.mkdir(dir, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(dir, fileName), buffer);
  const publicPath = `/uploads/avatars/${fileName}`;
  await run("UPDATE users SET photo_path = @photoPath WHERE id = @id", { photoPath: publicPath, id: user.id });

  return Response.json({ photo_path: publicPath });
}
