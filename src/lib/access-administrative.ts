import { ROLE_LABELS, type UserRole } from "@/lib/types";

/** Papéis operacionais atribuíveis por perfil de acesso (aba Administrativos). */
export const ADMINISTRATIVE_ROLES: UserRole[] = ["bdr", "product_owner", "manager", "admin"];

export type AdministrativeRoleDefinition = {
  role: UserRole;
  label: string;
  hint: string;
};

export const ADMINISTRATIVE_ROLE_DEFINITIONS: AdministrativeRoleDefinition[] = [
  {
    role: "bdr",
    label: ROLE_LABELS.bdr,
    hint: "Prospecção, abordagens e funil de vendas."
  },
  {
    role: "product_owner",
    label: ROLE_LABELS.product_owner,
    hint: "Dono de produto e empresa (cadastros vinculados)."
  },
  {
    role: "manager",
    label: ROLE_LABELS.manager,
    hint: "Visão gerencial e equipe."
  },
  {
    role: "admin",
    label: ROLE_LABELS.admin,
    hint: "Configurações avançadas, cadastros administrativos e APIs restritas."
  }
];

const ROLE_SET = new Set<string>(ADMINISTRATIVE_ROLES);

export function isAdministrativeRole(value: string): value is UserRole {
  return ROLE_SET.has(value);
}

export function validateAdministrativeRoles(roles: string[]): UserRole[] {
  return roles.filter(isAdministrativeRole);
}
