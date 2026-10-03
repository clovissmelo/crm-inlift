"use client";

import { useEffect, useState } from "react";
import { CadastroModal } from "@/components/cadastro-ui";
import { Api4comCallResultForm } from "@/components/api4com-call-result-modal";
import type { Product } from "@/lib/types";

type ResultRow = {
  id: number;
  name: string;
  slug: string;
};

export function ResultadoComercialTestModal({
  open,
  onClose,
  result
}: {
  open: boolean;
  onClose: () => void;
  result: ResultRow | null;
}) {
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    if (!open) return;
    void fetch("/api/products")
      .then((r) => r.json())
      .then((data) => {
        const items = (data as { items?: Product[] }).items ?? [];
        setProducts(items);
      })
      .catch(() => setProducts([]));
  }, [open]);

  if (!open || !result) return null;

  return (
    <CadastroModal open={open} title="COMPLEMENTO DE REGISTRO" onClose={onClose} wide>
      <Api4comCallResultForm
        callId={null}
        active={open}
        layout="modal"
        products={products}
        simulation={{ initialCommercialResultId: result.id }}
        onClose={onClose}
        onCompleted={onClose}
      />
    </CadastroModal>
  );
}
