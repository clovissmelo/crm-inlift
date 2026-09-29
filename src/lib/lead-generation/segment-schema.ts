import { z } from "zod";

/** Slug do segmento (cadastro em Admin → Motor de leads). */
export const leadGenSegmentZod = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9_]+$/, "Slug de segmento inválido");
