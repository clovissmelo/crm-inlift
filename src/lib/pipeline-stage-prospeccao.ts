import { PROSPECCAO_PIPELINE_STAGE_NAME } from "@/lib/attendance/operational-actions";

/** Coluna do funil que espelha a fila Leads para contato (não cartões de oportunidade). */
export function isProspeccaoPipelineStage(stage: { name: string }): boolean {
  const normalize = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "");
  const n = normalize(stage.name);
  const canonical = normalize(PROSPECCAO_PIPELINE_STAGE_NAME);
  if (n === canonical) return true;
  if (n === "em prospeccao") return true;
  return n.startsWith("em prospec") && n.includes("prospec");
}
