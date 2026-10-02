import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { buildClientDialStrategySummary } from "@/lib/call-strategy/eligible-phones";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const clientId = Number((await params).id);
  const summary = await buildClientDialStrategySummary({ clientId });
  const history = await all<{
    id: number;
    client_phone_id: number;
    created_at: string;
    attempt_bucket: string;
    consumes_cycle: boolean;
    technical_slug: string | null;
    commercial_slug: string | null;
    user_id: number;
    approach_id: number | null;
    user_name: string | null;
    phone_display: string | null;
  }>(
    `
      SELECT pda.id, pda.client_phone_id, pda.created_at, pda.attempt_bucket, pda.consumes_cycle,
        pda.technical_slug, pda.commercial_slug, pda.user_id, pda.approach_id,
        u.name AS user_name,
        COALESCE(cp.display_phone, cp.phone_digits) AS phone_display
      FROM phone_dial_attempts pda
      LEFT JOIN users u ON u.id = pda.user_id
      LEFT JOIN client_phones cp ON cp.id = pda.client_phone_id
      WHERE pda.client_id = @clientId
      ORDER BY pda.created_at DESC
      LIMIT 200
    `,
    { clientId }
  );
  return Response.json({ ...summary, history });
}
