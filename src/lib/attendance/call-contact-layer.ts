export type ContactLayerChoice = "ninguem" | "outra" | "decisor";

const NO_NINGUEM_SLUGS = new Set([
  "pediu_retorno",
  "demonstrou_interesse",
  "sem_interesse",
  "reuniao_agendada"
]);

export function contactSlugForLayerChoice(choice: ContactLayerChoice): string {
  switch (choice) {
    case "ninguem":
      return "nenhum_contato";
    case "outra":
      return "falou_outra_pessoa";
    case "decisor":
      return "falou_responsavel";
  }
}

export function layerChoiceFromContactSlug(slug: string | null | undefined): ContactLayerChoice | null {
  if (slug === "nenhum_contato") return "ninguem";
  if (slug === "falou_outra_pessoa") return "outra";
  if (slug === "falou_responsavel") return "decisor";
  return null;
}

export function spokeWithDecisionMakerForChoice(choice: ContactLayerChoice | null): boolean | null {
  if (choice === "decisor") return true;
  if (choice === "outra") return false;
  return null;
}

/** Telefonia atendeu + resultado comercial definem quais botões de contato aparecem. */
export function resolveContactLayerOptions(input: {
  callAnswered: boolean;
  commercialSlug: string | null;
  nenhumContatoTypeId: number | null;
  commercialTypeId: number | null;
  compatMap: Record<string, number[]>;
}): ContactLayerChoice[] {
  if (!input.callAnswered) return ["ninguem"];

  if (input.commercialSlug === "sem_contato") return ["ninguem"];

  const allowsNinguem = commercialAllowsNinguem(
    input.commercialTypeId,
    input.commercialSlug,
    input.nenhumContatoTypeId,
    input.compatMap
  );

  if (!allowsNinguem || (input.commercialSlug && NO_NINGUEM_SLUGS.has(input.commercialSlug))) {
    return ["outra", "decisor"];
  }

  return ["ninguem", "outra", "decisor"];
}

export function commercialAllowsNinguem(
  commercialTypeId: number | null,
  commercialSlug: string | null,
  nenhumContatoTypeId: number | null,
  compatMap: Record<string, number[]>
): boolean {
  if (commercialSlug === "sem_contato") return true;
  if (commercialSlug && NO_NINGUEM_SLUGS.has(commercialSlug)) return false;
  if (!commercialTypeId || !nenhumContatoTypeId) return true;
  const compat = compatMap[String(nenhumContatoTypeId)];
  if (!compat?.length) return true;
  return compat.includes(commercialTypeId);
}

export function contactLayerRequiresPersonName(choice: ContactLayerChoice | null): boolean {
  return choice === "outra" || choice === "decisor";
}
