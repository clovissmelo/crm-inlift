import type { ReactNode } from "react";

/** Texto de instrução abaixo do cabeçalho (topbar); deixa margem antes de filtros/conteúdo. */
export function PageIntro({ children }: { children: ReactNode }) {
  return <p className="page-intro muted">{children}</p>;
}
