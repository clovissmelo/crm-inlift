import type { LeadGenCounts } from "@/lib/lead-generation/types";

const MAX_LINES = 14;

export function appendMotorLog(counts: LeadGenCounts, message: string): LeadGenCounts {
  const stamp = new Date().toISOString().slice(11, 19);
  const line = `${stamp} ${message}`;
  const prev = counts.motor_log ?? [];
  return { ...counts, motor_log: [line, ...prev].slice(0, MAX_LINES) };
}
