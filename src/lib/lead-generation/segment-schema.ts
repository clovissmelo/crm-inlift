import { LEAD_GEN_SEGMENT_OPTIONS, type LeadGenSegmentFilter } from "@/lib/lead-motor/lead-gen-segments";
import { z } from "zod";

const segmentValues = LEAD_GEN_SEGMENT_OPTIONS.map((o) => o.value) as [
  LeadGenSegmentFilter,
  ...LeadGenSegmentFilter[]
];

export const leadGenSegmentZod = z.enum(segmentValues);
