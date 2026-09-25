import { jsonUnauthorized, requireApiUser } from "@/lib/auth";
import { findMeetingConflicts } from "@/lib/meetings";

export async function GET(request: Request) {
  const user = await requireApiUser();
  if (!user) return jsonUnauthorized();
  const url = new URL(request.url);
  const startsAt = url.searchParams.get("starts_at");
  const duration = Number(url.searchParams.get("duration_minutes") ?? 30);
  const userIds = (url.searchParams.get("user_ids") ?? "")
    .split(",")
    .map((v) => Number(v.trim()))
    .filter(Number.isInteger);
  const exclude = url.searchParams.get("exclude_meeting_id");
  if (!startsAt || !userIds.length) {
    return Response.json({ error: "Parâmetros inválidos" }, { status: 400 });
  }
  const conflicts = await findMeetingConflicts(
    userIds,
    startsAt,
    duration,
    exclude ? Number(exclude) : undefined
  );
  return Response.json({ conflicts });
}
