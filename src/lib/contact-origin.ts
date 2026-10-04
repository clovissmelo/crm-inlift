/** Rótulos gravados em contacts.origin */
export const CONTACT_ORIGIN = {
  manual: "Manual",
  googlePlaces: "Google Places",
  receitaFederal: "Receita Federal",
  importSpreadsheet: "Importação planilha",
  callScript: "Roteiro de ligação"
} as const;

export type ContactOriginLabel = (typeof CONTACT_ORIGIN)[keyof typeof CONTACT_ORIGIN];

export function formatContactOrigin(origin: string | null | undefined): string {
  const t = origin?.trim();
  return t || CONTACT_ORIGIN.manual;
}
