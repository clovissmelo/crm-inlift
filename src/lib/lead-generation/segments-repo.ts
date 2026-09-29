import { all, run, nowIso } from "@/lib/db";
import type { LeadGenSegmentFilter } from "@/lib/lead-motor/lead-gen-segments";
import { LEAD_GEN_SEGMENT_OPTIONS } from "@/lib/lead-motor/lead-gen-segments";

export type LeadGenSegmentRow = {
  slug: string;
  label: string;
  filter_kind: LeadGenSegmentFilter;
  sort_order: number;
  active: boolean;
  default_flow_id: number | null;
};

const FILTER_KINDS: LeadGenSegmentFilter[] = ["all", "branded", "white_flag", "distributor", "trr"];

function fallbackSegments(): LeadGenSegmentRow[] {
  return LEAD_GEN_SEGMENT_OPTIONS.map((o, i) => ({
    slug: o.value,
    label: o.label,
    filter_kind: o.value,
    sort_order: (i + 1) * 10,
    active: true,
    default_flow_id: null
  }));
}

export async function listLeadGenSegments(opts?: { activeOnly?: boolean }): Promise<LeadGenSegmentRow[]> {
  try {
    const rows = await all<{
      slug: string;
      label: string;
      filter_kind: string;
      sort_order: number;
      active: boolean;
      default_flow_id: number | null;
    }>(
      `
        SELECT slug, label, filter_kind, sort_order, active, default_flow_id
        FROM lead_generation_segments
        ${opts?.activeOnly ? "WHERE active = true" : ""}
        ORDER BY sort_order ASC, label ASC
      `
    );
    if (rows.length === 0) return fallbackSegments();
    return rows.map((r) => ({
      slug: r.slug,
      label: r.label,
      filter_kind: FILTER_KINDS.includes(r.filter_kind as LeadGenSegmentFilter)
        ? (r.filter_kind as LeadGenSegmentFilter)
        : "all",
      sort_order: Number(r.sort_order),
      active: Boolean(r.active),
      default_flow_id: r.default_flow_id != null ? Number(r.default_flow_id) : null
    }));
  } catch {
    return fallbackSegments();
  }
}

export async function resolveSegmentFilterKind(slug: string): Promise<LeadGenSegmentFilter> {
  const list = await listLeadGenSegments();
  const row = list.find((s) => s.slug === slug && s.active);
  return row?.filter_kind ?? "all";
}

export async function saveLeadGenSegments(
  items: Array<{
    slug: string;
    label: string;
    filter_kind: LeadGenSegmentFilter;
    sort_order: number;
    active: boolean;
    default_flow_id?: number | null;
  }>
) {
  for (const item of items) {
    const slug = item.slug.trim().toLowerCase().replace(/\s+/g, "_");
    if (!slug) continue;
    await run(
      `
        INSERT INTO lead_generation_segments (slug, label, filter_kind, sort_order, active, default_flow_id, updated_at)
        VALUES (@slug, @label, @filterKind, @sortOrder, @active, @flowId, @now)
        ON CONFLICT (slug) DO UPDATE SET
          label = EXCLUDED.label,
          filter_kind = EXCLUDED.filter_kind,
          sort_order = EXCLUDED.sort_order,
          active = EXCLUDED.active,
          default_flow_id = EXCLUDED.default_flow_id,
          updated_at = EXCLUDED.updated_at
      `,
      {
        slug,
        label: item.label.trim(),
        filterKind: item.filter_kind,
        sortOrder: item.sort_order,
        active: item.active,
        flowId: item.default_flow_id ?? null,
        now: nowIso()
      }
    );
  }
}

export { FILTER_KINDS as LEAD_GEN_FILTER_KINDS };
