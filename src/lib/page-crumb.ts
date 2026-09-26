const ADMIN_SEGMENTS: Record<string, string> = {
  usuarios: "usuários",
  importacao: "importação",
  "novos-leads": "novos leads",
  variaveis: "variáveis"
};

/** Rótulo curto da página atual para o cabeçalho (minúsculas). */
export function pageCrumbSegments(pathname: string): string[] {
  const segments = ["inlift"];

  if (pathname === "/" || pathname === "/dashboard") {
    segments.push("dashboard");
    return segments;
  }

  if (pathname.startsWith("/funil")) {
    segments.push("funil");
    return segments;
  }
  if (pathname.startsWith("/negocios-convertidos")) {
    segments.push("negócios convertidos");
    return segments;
  }

  if (pathname.startsWith("/prospeccao")) {
    segments.push("leads prospecção");
    return segments;
  }
  if (pathname.startsWith("/retornos")) {
    segments.push("retornos");
    return segments;
  }
  if (pathname.startsWith("/agendamentos")) {
    segments.push("agendamentos");
    return segments;
  }

  if (pathname === "/clientes/novo") {
    segments.push("clientes", "novo");
    return segments;
  }
  if (pathname.startsWith("/clientes/")) {
    segments.push("clientes", "detalhe");
    return segments;
  }
  if (pathname.startsWith("/clientes")) {
    segments.push("clientes");
    return segments;
  }

  if (pathname.startsWith("/abordagens")) {
    segments.push("abordagens");
    return segments;
  }
  if (pathname.startsWith("/organizacao-leads")) {
    segments.push("organização de leads");
    return segments;
  }
  if (pathname.startsWith("/empresas")) {
    segments.push("empresas");
    return segments;
  }
  if (pathname.startsWith("/produtos")) {
    segments.push("produtos");
    return segments;
  }

  if (pathname.startsWith("/oportunidades/")) {
    segments.push("oportunidade");
    return segments;
  }

  if (pathname.startsWith("/admin")) {
    segments.push("admin");
    const rest = pathname.slice("/admin".length).replace(/^\//, "");
    if (rest) {
      const key = rest.split("/")[0] ?? rest;
      segments.push(ADMIN_SEGMENTS[key] ?? key.replace(/-/g, " "));
    }
    return segments;
  }

  if (pathname.startsWith("/perfil")) {
    segments.push("perfil");
    return segments;
  }

  const fallback = pathname.split("/").filter(Boolean)[0]?.replace(/-/g, " ");
  if (fallback) segments.push(fallback);
  return segments;
}
