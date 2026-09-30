import { requireAdminApi } from "@/lib/admin";
import { requireApiUser } from "@/lib/auth";
import { getMunicipalityGenerationIndicators } from "@/lib/lead-generation/municipality-runs";
import { z } from "zod";

const bodySchema = z.object({
  product_id: z.number().int().positive(),
  ibge_codes: z.array(z.number().int()).max(600)
});

export async function POST(request: Request) {
  const user = await requireApiUser();
  const denied = await requireAdminApi(user);
  if (denied) return denied;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }

  const indicators = await getMunicipalityGenerationIndicators({
    product_id: parsed.data.product_id,
    ibge_codes: parsed.data.ibge_codes.filter((c) => c > 0)
  });

  const byCode: Record<
    string,
    { status: string; last_at: string; run_id: number }
  > = {};
  for (const ind of indicators) {
    byCode[String(ind.ibge_code)] = {
      status: ind.status,
      last_at: ind.last_at,
      run_id: ind.run_id
    };
  }

  return Response.json({ indicators: byCode });
}
