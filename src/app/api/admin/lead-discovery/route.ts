import { requireAdminApi } from "@/lib/admin";
import { requireApiUser } from "@/lib/auth";
import { run, nowIso } from "@/lib/db";
import { runLeadDiscovery } from "@/lib/lead-discovery";
import { z } from "zod";

const bodySchema = z.object({
  uf: z.string().trim().min(2).max(2),
  cities: z.string().trim().min(1),
  segment: z.string().trim().min(1),
  quantity: z.number().int().min(1).max(500),
  acknowledge_charges: z.literal(true)
});

export async function POST(request: Request) {
  const user = await requireApiUser();
  const denied = await requireAdminApi(user);
  if (denied) return denied;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }

  const data = parsed.data;
  const cities = data.cities
    .split(/[,;\n]/)
    .map((c) => c.trim())
    .filter(Boolean);

  const runRow = await run(
    `
      INSERT INTO lead_discovery_runs (
        requested_by_user_id, uf, cities, segment, quantity_requested, status, created_at
      ) VALUES (@userId, @uf, @cities, @segment, @qty, 'running', @now)
    `,
    {
      userId: user!.id,
      uf: data.uf.toUpperCase(),
      cities: cities.join(", "),
      segment: data.segment,
      qty: data.quantity,
      now: nowIso()
    }
  );

  const result = await runLeadDiscovery({
    uf: data.uf.toUpperCase(),
    cities,
    segment: data.segment,
    quantity: data.quantity
  });

  const runId = runRow.lastInsertRowid;
  if (runId) {
    await run(
      `
        UPDATE lead_discovery_runs SET
          status = @status,
          quantity_inserted = @inserted,
          quantity_skipped_existing = @skipped,
          error_message = @message,
          completed_at = @now
        WHERE id = @id
      `,
      {
        id: runId,
        status: result.status,
        inserted: result.inserted,
        skipped: result.skipped_existing,
        message: result.message,
        now: nowIso()
      }
    );
  }

  return Response.json({ run_id: runId, ...result });
}
