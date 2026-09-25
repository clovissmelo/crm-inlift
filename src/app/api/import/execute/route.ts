import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { executeImport, parseSpreadsheetBuffer, type ImportColumnKey } from "@/lib/import-spreadsheet";

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();

  const form = await request.formData();
  const file = form.get("file");
  const mappingRaw = form.get("mapping");
  const defaultProductId = form.get("default_product_id");
  const defaultBdrUserId = form.get("default_bdr_user_id");

  if (!(file instanceof File) || typeof mappingRaw !== "string") {
    return Response.json({ error: "Dados incompletos" }, { status: 400 });
  }

  let mapping: Record<string, ImportColumnKey>;
  try {
    mapping = JSON.parse(mappingRaw) as Record<string, ImportColumnKey>;
  } catch {
    return Response.json({ error: "Mapeamento inválido" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = parseSpreadsheetBuffer(buffer, file.name);

  const result = await executeImport({
    rows: parsed.rows,
    mapping,
    userId: user.id,
    fileName: file.name,
    defaultProductId: defaultProductId ? Number(defaultProductId) : null,
    defaultBdrUserId: defaultBdrUserId ? Number(defaultBdrUserId) : null
  });

  return Response.json({ result });
}
