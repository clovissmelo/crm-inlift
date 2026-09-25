import type { LeadQualification } from "@/lib/lead-qualification";

export type UserRole = "bdr" | "product_owner" | "manager" | "admin";
export type UserStatus = "active" | "inactive";
export type ContactVerification = "unverified" | "confirmed" | "invalid_number" | "wrong_contact";
export type ProductStatus = "active" | "inactive";

export type User = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  photo_path: string | null;
  status: UserStatus;
  roles: UserRole[];
  created_at: string;
  last_access_at: string | null;
};

export type Product = {
  id: number;
  name: string;
  description: string | null;
  status: ProductStatus;
  uses_proposal: boolean;
  responsible_user_ids: number[];
};

export type ClientListItem = {
  id: number;
  cnpj: string | null;
  legal_name: string | null;
  trade_name: string | null;
  segment: string | null;
  city: string | null;
  uf: string | null;
  bdr_user_id: number | null;
  bdr_name: string | null;
  lead_qualification: LeadQualification;
  has_mobile: boolean;
  has_landline: boolean;
  has_verified_phone: boolean;
  product_ids: number[];
  has_approach: boolean;
};

export const ROLE_LABELS: Record<UserRole, string> = {
  bdr: "BDR",
  product_owner: "Responsável por produto",
  manager: "Gestor",
  admin: "Administrador"
};

export const VERIFICATION_LABELS: Record<ContactVerification, string> = {
  unverified: "Não verificado",
  confirmed: "Confirmado",
  invalid_number: "Número inválido",
  wrong_contact: "Contato incorreto"
};
