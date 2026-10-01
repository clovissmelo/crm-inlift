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
  }>(
    `
      SELECT id, client_phone_id, created_at, attempt_bucket, consumes_cycle,
        technical_slug, commercial_slug, user_id, approach_id
      FROM phone_dial_attempts
      WHERE client_id = @clientId
      ORDER BY created_at DESC
      LIMIT 200
    `,
    { clientId }
  );
  return Response.json({ ...summary, history });
}
