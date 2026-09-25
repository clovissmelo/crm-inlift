import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { parseSpreadsheetBuffer } from "@/lib/import-spreadsheet";

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Arquivo não enviado" }, { status: 400 });
  }
  const name = file.name.toLowerCase();
  if (!name.endsWith(".xlsx") && !name.endsWith(".csv")) {
    return Response.json({ error: "Use .xlsx ou .csv" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = parseSpreadsheetBuffer(buffer, file.name);
  return Response.json({
    headers: parsed.headers,
    preview: parsed.rows.slice(0, 20),
    total_rows: parsed.rows.length
  });
}
