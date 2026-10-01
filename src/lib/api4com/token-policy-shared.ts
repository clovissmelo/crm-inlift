export type Api4comTokenPolicy = "global" | "per_bdr";

export const API4COM_TOKEN_POLICY_LABELS: Record<Api4comTokenPolicy, string> = {
  global: "Token único (administrador)",
  per_bdr: "Cada BDR no perfil"
};
