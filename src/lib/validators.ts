import { z } from "zod";
import { normalizeCnpj } from "@/lib/format";

export const loginSchema = z.object({
  email: z.string().trim().email("E-mail inválido"),
  password: z.string().min(1, "Informe a senha")
});

const api4comApiTokenField = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => {
    const t = v?.trim() ?? "";
    return t ? t : null;
  })
  .refine((v) => v === null || v.length >= 8, "Token inválido (mínimo 8 caracteres)");

const api4comExtensionField = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => {
    const t = v?.trim() ?? "";
    return t ? t : null;
  })
  .refine((v) => v === null || /^[0-9A-Za-z_-]{2,12}$/.test(v), "Ramal inválido (2–12 caracteres alfanuméricos)");

const userBodySchema = z.object({
  name: z.string().trim().min(2, "Nome obrigatório"),
  email: z.string().trim().email("E-mail inválido"),
  phone: z.string().trim().optional().nullable(),
  status: z.enum(["active", "inactive"]),
  roles: z.array(z.enum(["bdr", "product_owner", "manager", "admin"])).optional(),
  access_profile_ids: z.array(z.number().int().positive()).optional(),
  password: z.string().min(8, "Senha com no mínimo 8 caracteres"),
  api4com_extension: api4comExtensionField,
  api4com_api_token: api4comApiTokenField
});

function userHasAccessProfileOrRole(data: {
  access_profile_ids?: number[];
  roles?: Array<"bdr" | "product_owner" | "manager" | "admin">;
}) {
  return (data.access_profile_ids?.length ?? 0) > 0 || (data.roles?.length ?? 0) > 0;
}

export const userCreateSchema = userBodySchema.refine(userHasAccessProfileOrRole, {
  message: "Selecione ao menos um perfil de acesso.",
  path: ["access_profile_ids"]
});

export const userUpdateSchema = userBodySchema
  .partial()
  .extend({
    password: z.string().min(8).optional(),
    clear_api4com_api_token: z.boolean().optional()
  })
  .refine(
    (data) => {
      if (data.access_profile_ids === undefined && data.roles === undefined) return true;
      return userHasAccessProfileOrRole(data);
    },
    {
      message: "Selecione ao menos um perfil de acesso.",
      path: ["access_profile_ids"]
    }
  );

export const profileUpdateSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().trim().email(),
  phone: z.string().trim().optional().nullable(),
  api4com_extension: api4comExtensionField,
  api4com_api_token: api4comApiTokenField,
  clear_api4com_api_token: z.boolean().optional(),
  current_password: z.string().optional(),
  new_password: z.string().min(8).optional()
});

export const api4comStartCallSchema = z.object({
  client_id: z.number().int().positive().optional().nullable(),
  contact_id: z.number().int().positive().optional().nullable(),
  product_id: z.number().int().positive().optional().nullable(),
  phone: z.string().trim().min(8, "Informe o telefone"),
  dial_session_root_id: z.number().int().positive().optional().nullable(),
  dial_as_user_id: z.number().int().positive().optional().nullable()
});

export const companySchema = z.object({
  name: z.string().trim().min(1, "Nome obrigatório"),
  legal_name: z.string().trim().optional().nullable(),
  cnpj: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v?.trim() ? normalizeCnpj(v) : null)),
  responsible_user_id: z.number().int().positive().optional().nullable(),
  status: z.enum(["active", "inactive"])
});

export const productSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().optional().nullable(),
  status: z.enum(["active", "inactive"]),
  uses_proposal: z.boolean(),
  company_id: z.number().int().positive("Selecione a empresa"),
  responsible_user_ids: z.array(z.number().int().positive()),
  lead_gen_segment_slug: z.string().trim().min(1).max(64).optional().nullable(),
  lead_gen_flow_id: z.number().int().positive().optional().nullable()
});

export const clientSchema = z.object({
  cnpj: z
    .string()
    .optional()
    .nullable()
    .transform((v) => normalizeCnpj(v ?? "")),
  legal_name: z.string().trim().optional().nullable(),
  trade_name: z.string().trim().optional().nullable(),
  segment: z.string().trim().optional().nullable(),
  city: z.string().trim().optional().nullable(),
  uf: z.string().trim().max(2).optional().nullable(),
  address: z.string().trim().optional().nullable(),
  website: z.string().trim().optional().nullable(),
  instagram: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  bdr_user_id: z.number().int().positive().optional().nullable(),
  product_ids: z.array(z.number().int().positive()).optional(),
  lead_qualification: z.enum(["cold", "warm", "hot"]).optional(),
  is_existing_customer: z.boolean().optional()
});

export const approachCreateSchema = z.object({
  client_id: z.number().int().positive(),
  contact_id: z.number().int().positive().optional().nullable(),
  product_id: z.number().int().positive().optional().nullable(),
  channel: z.enum(["call", "whatsapp", "email"]),
  occurred_at: z.string().min(1).optional().nullable(),
  result_type_id: z.number().int().positive(),
  notes: z.string().trim().optional().nullable(),
  external_call_id: z.string().trim().optional().nullable(),
  follow_up_id: z.number().int().positive().optional().nullable(),
  spoke_with_decision_maker: z.boolean().optional().nullable(),
  api4com_call_row_id: z.number().int().positive().optional().nullable(),
  contact_outcome_type_id: z.number().int().positive().optional().nullable(),
  contacted_person_name: z.string().trim().optional().nullable(),
  contacted_person_job_title: z.string().trim().optional().nullable(),
  contacted_person_notes: z.string().trim().optional().nullable(),
  linked_contact_id: z.number().int().positive().optional().nullable(),
  registration_status: z.enum(["draft", "final"]).optional(),
  next_action: z.discriminatedUnion("type", [
    z.object({ type: z.literal("none") }),
    z.object({
      type: z.enum(["schedule_return", "schedule_meeting"]),
      scheduled_at: z.string().min(1),
      contact_id: z.number().int().positive().optional().nullable(),
      product_id: z.number().int().positive().optional().nullable(),
      notes: z.string().trim().optional().nullable()
    }),
    z.object({
      type: z.enum(["pause", "close"]),
      product_id: z.number().int().positive(),
      reason_id: z.number().int().positive()
    })
  ])
});

export const messageScriptSchema = z.object({
  title: z.string().trim().min(1),
  product_id: z.number().int().positive().optional().nullable(),
  script_type: z.enum(["call", "whatsapp", "email"]),
  body: z.string().trim().min(1),
  status: z.enum(["active", "inactive"])
});

export const meetingCreateSchema = z.object({
  client_id: z.number().int().positive(),
  product_id: z.number().int().positive().optional().nullable(),
  contact_id: z.number().int().positive().optional().nullable(),
  opportunity_id: z.number().int().positive().optional().nullable(),
  bdr_user_id: z.number().int().positive(),
  source_approach_id: z.number().int().positive().optional().nullable(),
  title: z.string().trim().min(1),
  starts_at: z.string().min(1),
  duration_minutes: z.number().int().min(5).max(480),
  status: z.enum(["scheduled", "confirmed", "held", "no_show", "cancelled", "rescheduled"]).optional(),
  notes: z.string().trim().optional().nullable(),
  internal_user_ids: z.array(z.number().int().positive()).min(1),
  external_participants: z
    .array(
      z.object({
        email: z.string().email(),
        display_name: z.string().optional().nullable(),
        contact_id: z.number().int().positive().optional().nullable()
      })
    )
    .optional(),
  idempotency_key: z.string().trim().optional().nullable()
});

export const meetingUpdateSchema = z.object({
  title: z.string().trim().min(1).optional(),
  starts_at: z.string().min(1).optional(),
  duration_minutes: z.number().int().min(5).max(480).optional(),
  status: z.enum(["scheduled", "confirmed", "held", "no_show", "cancelled", "rescheduled"]).optional(),
  notes: z.string().trim().optional().nullable(),
  summary: z.string().trim().optional().nullable(),
  interest_notes: z.string().trim().optional().nullable(),
  next_step: z.string().trim().optional().nullable(),
  internal_user_ids: z.array(z.number().int().positive()).optional(),
  external_participants: z
    .array(
      z.object({
        email: z.string().email(),
        display_name: z.string().optional().nullable(),
        contact_id: z.number().int().positive().optional().nullable()
      })
    )
    .optional(),
  cancel_reason: z.string().trim().optional().nullable(),
  reschedule_reason: z.string().trim().optional().nullable()
});

const approachNextActionKeySchema = z.enum([
  "none",
  "schedule_return",
  "schedule_meeting",
  "pause",
  "close"
]);

export const catalogItemSchema = z.object({
  name: z.string().trim().min(1),
  status: z.enum(["active", "inactive"]).optional(),
  suggest_follow_up: z.boolean().optional(),
  kind: z.enum(["pause", "close"]).optional(),
  lead_qualification: z.enum(["cold", "warm", "hot"]).optional().nullable(),
  collect_notes: z.boolean().optional(),
  require_schedule_return: z.boolean().optional(),
  require_final_registration: z.boolean().optional(),
  ask_decision_maker: z.boolean().optional(),
  mark_phone_verified: z.boolean().optional(),
  allowed_next_actions: z.array(approachNextActionKeySchema).optional().nullable()
});

export const contactSchema = z.object({
  name: z.string().trim().min(1),
  job_title: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  whatsapp: z.string().trim().optional().nullable(),
  email: z.string().trim().email().optional().nullable().or(z.literal("")),
  notes: z.string().trim().optional().nullable(),
  verification_status: z.enum(["unverified", "confirmed", "invalid_number", "wrong_contact"]),
  origin: z.string().trim().min(1).optional().nullable(),
  profile_tags: z.array(z.string().trim().min(1).max(80)).optional()
});

export const opportunityCreateSchema = z.object({
  client_id: z.number().int().positive(),
  product_id: z.number().int().positive(),
  title: z.string().trim().optional(),
  origin_bdr_user_id: z.number().int().positive().optional().nullable(),
  owner_user_id: z.number().int().positive().optional().nullable(),
  closer_user_id: z.number().int().positive().optional().nullable(),
  temperature: z.enum(["cold", "warm", "hot"]).optional().nullable(),
  pipeline_stage_id: z.number().int().positive().optional().nullable(),
  estimated_value: z.number().optional().nullable(),
  estimated_value_tbd: z.boolean().optional(),
  expected_close_date: z.string().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  force_create: z.boolean().optional(),
  return_to_prospection: z.boolean().optional()
});

export const opportunityUpdateSchema = z.object({
  title: z.string().trim().min(1).optional(),
  owner_user_id: z.number().int().positive().optional().nullable(),
  closer_user_id: z.number().int().positive().optional().nullable(),
  temperature: z.enum(["cold", "warm", "hot"]).nullable().optional(),
  estimated_value: z.number().optional().nullable(),
  estimated_value_tbd: z.boolean().optional(),
  expected_close_date: z.string().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  expected_version: z.number().int().positive()
});

export const opportunityStageMoveSchema = z.object({
  to_stage_id: z.number().int().positive(),
  expected_version: z.number().int().positive(),
  notes: z.string().trim().optional().nullable(),
  enter_notes: z.string().trim().optional().nullable(),
  enter_action: z
    .object({
      type: z.enum(["schedule_return", "schedule_meeting", "pause"]),
      scheduled_at: z.string().optional(),
      notes: z.string().trim().optional().nullable(),
      reason_id: z.number().int().positive().optional()
    })
    .optional()
    .nullable(),
  lost_reason_id: z.number().int().positive().optional().nullable(),
  lost_notes: z.string().trim().optional().nullable(),
  conversion: z
    .object({
      closer_user_id: z.number().int().positive(),
      closed_at: z.string().min(1),
      deal_value: z.number().optional().nullable(),
      deal_value_tbd: z.boolean().optional()
    })
    .optional()
});

export const pipelineStageSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1),
  sort_order: z.number().int(),
  color: z.string().trim().min(1),
  status: z.enum(["active", "inactive"]),
  kind: z.enum(["in_progress", "won", "lost"]),
  enter_collect_notes: z.boolean().optional(),
  enter_allowed_next_actions: z.string().nullable().optional(),
  enter_require_next_action: z.boolean().optional()
});

export const pipelineStageDeleteSchema = z.object({
  reassign_to_stage_id: z.number().int().positive().optional()
});

export const proposalSentSchema = z.object({
  sent_at: z.string().min(1),
  sent_channel: z.string().trim().min(1)
});
