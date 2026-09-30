import { all, get, nowIso, run } from "@/lib/db";

export type ResultRegistrationAssociationRow = {
  id: number;
  call_technical_result_type_id: number;
  commercial_result_type_id: number;
  pipeline_stage_id: number | null;
  collect_notes: boolean | null;
  require_schedule_return: boolean | null;
  require_final_registration: boolean | null;
  ask_decision_maker: boolean | null;
  mark_phone_verified: boolean | null;
  allowed_next_actions: unknown | null;
  status: string;
};

export type ResultRegistrationAssociationView = ResultRegistrationAssociationRow & {
  technical_slug: string;
  technical_display_name: string;
  technical_answered: boolean;
  commercial_slug: string;
  commercial_name: string;
  pipeline_stage_name: string | null;
};

const SELECT_VIEW = `
  SELECT
    a.id,
    a.call_technical_result_type_id,
    a.commercial_result_type_id,
    a.pipeline_stage_id,
    a.collect_notes,
    a.require_schedule_return,
    a.require_final_registration,
    a.ask_decision_maker,
    a.mark_phone_verified,
    a.allowed_next_actions,
    a.status,
    t.slug AS technical_slug,
    t.display_name AS technical_display_name,
    t.answered AS technical_answered,
    cr.slug AS commercial_slug,
    cr.name AS commercial_name,
    ps.name AS pipeline_stage_name
  FROM result_registration_associations a
  JOIN call_technical_result_types t ON t.id = a.call_technical_result_type_id
  JOIN approach_result_types cr ON cr.id = a.commercial_result_type_id
  LEFT JOIN pipeline_stages ps ON ps.id = a.pipeline_stage_id
`;

export async function listResultRegistrationAssociations(options?: {
  status?: "active" | "inactive" | "all";
}): Promise<ResultRegistrationAssociationView[]> {
  const status = options?.status ?? "all";
  const where =
    status === "all" ? "" : status === "active" ? "WHERE a.status = 'active'" : "WHERE a.status = 'inactive'";
  return all<ResultRegistrationAssociationView>(
    `${SELECT_VIEW} ${where} ORDER BY t.answered DESC, t.sort_order, t.id, cr.sort_order, cr.name, a.id`
  );
}

export async function getResultRegistrationAssociationById(id: number) {
  return get<ResultRegistrationAssociationView>(`${SELECT_VIEW} WHERE a.id = @id`, { id });
}

export async function getActiveAssociationForPair(
  technicalTypeId: number,
  commercialResultTypeId: number
): Promise<ResultRegistrationAssociationRow | null> {
  return get<ResultRegistrationAssociationRow>(
    `
      SELECT id, call_technical_result_type_id, commercial_result_type_id, pipeline_stage_id,
        collect_notes, require_schedule_return, require_final_registration, ask_decision_maker,
        mark_phone_verified, allowed_next_actions, status
      FROM result_registration_associations
      WHERE call_technical_result_type_id = @technicalId
        AND commercial_result_type_id = @commercialId
        AND status = 'active'
      LIMIT 1
    `,
    { technicalId: technicalTypeId, commercialId: commercialResultTypeId }
  );
}

export async function isCommercialAllowedForTechnical(
  technicalTypeId: number,
  commercialResultTypeId: number
): Promise<boolean> {
  const row = await get<{ ok: number }>(
    `
      SELECT 1 AS ok FROM result_registration_associations
      WHERE call_technical_result_type_id = @technicalId
        AND commercial_result_type_id = @commercialId
        AND status = 'active'
      LIMIT 1
    `,
    { technicalId: technicalTypeId, commercialId: commercialResultTypeId }
  );
  return Boolean(row?.ok);
}

export async function listActiveCommercialIdsForTechnical(technicalTypeId: number): Promise<number[]> {
  const rows = await all<{ commercial_result_type_id: number }>(
    `
      SELECT commercial_result_type_id
      FROM result_registration_associations
      WHERE call_technical_result_type_id = @technicalId AND status = 'active'
      ORDER BY commercial_result_type_id
    `,
    { technicalId: technicalTypeId }
  );
  return rows.map((r) => r.commercial_result_type_id);
}

export type UpsertAssociationInput = {
  call_technical_result_type_id: number;
  commercial_result_type_id: number;
  pipeline_stage_id?: number | null;
  collect_notes?: boolean | null;
  require_schedule_return?: boolean | null;
  require_final_registration?: boolean | null;
  ask_decision_maker?: boolean | null;
  mark_phone_verified?: boolean | null;
  allowed_next_actions?: unknown | null;
  status?: "active" | "inactive";
};

export async function createResultRegistrationAssociation(input: UpsertAssociationInput): Promise<number> {
  const now = nowIso();
  const dup = await get<{ id: number; status: string }>(
    `
      SELECT id, status FROM result_registration_associations
      WHERE call_technical_result_type_id = @technicalId AND commercial_result_type_id = @commercialId
    `,
    { technicalId: input.call_technical_result_type_id, commercialId: input.commercial_result_type_id }
  );
  if (dup) {
    throw new Error("DUPLICATE_PAIR");
  }
  const result = await run(
    `
      INSERT INTO result_registration_associations (
        call_technical_result_type_id, commercial_result_type_id, pipeline_stage_id,
        collect_notes, require_schedule_return, require_final_registration,
        ask_decision_maker, mark_phone_verified, allowed_next_actions, status, created_at, updated_at
      ) VALUES (
        @technicalId, @commercialId, @stageId,
        @collectNotes, @requireScheduleReturn, @requireFinalRegistration,
        @askDecisionMaker, @markPhoneVerified, @allowedNextActions::jsonb, @status, @now, @now
      )
    `,
    {
      technicalId: input.call_technical_result_type_id,
      commercialId: input.commercial_result_type_id,
      stageId: input.pipeline_stage_id ?? null,
      collectNotes: input.collect_notes ?? null,
      requireScheduleReturn: input.require_schedule_return ?? null,
      requireFinalRegistration: input.require_final_registration ?? null,
      askDecisionMaker: input.ask_decision_maker ?? null,
      markPhoneVerified: input.mark_phone_verified ?? null,
      allowedNextActions:
        input.allowed_next_actions != null ? JSON.stringify(input.allowed_next_actions) : null,
      status: input.status ?? "active",
      now
    }
  );
  const id = result.lastInsertRowid;
  if (!id) throw new Error("INSERT_FAILED");
  return Number(id);
}

export async function updateResultRegistrationAssociation(
  id: number,
  input: Partial<UpsertAssociationInput>
): Promise<void> {
  const existing = await getResultRegistrationAssociationById(id);
  if (!existing) throw new Error("NOT_FOUND");

  if (
    input.call_technical_result_type_id != null &&
    input.commercial_result_type_id != null &&
    (input.call_technical_result_type_id !== existing.call_technical_result_type_id ||
      input.commercial_result_type_id !== existing.commercial_result_type_id)
  ) {
    const dup = await get<{ id: number }>(
      `
        SELECT id FROM result_registration_associations
        WHERE call_technical_result_type_id = @technicalId
          AND commercial_result_type_id = @commercialId
          AND id <> @id
      `,
      {
        technicalId: input.call_technical_result_type_id,
        commercialId: input.commercial_result_type_id,
        id
      }
    );
    if (dup) throw new Error("DUPLICATE_PAIR");
  }

  const now = nowIso();
  await run(
    `
      UPDATE result_registration_associations SET
        call_technical_result_type_id = COALESCE(@technicalId, call_technical_result_type_id),
        commercial_result_type_id = COALESCE(@commercialId, commercial_result_type_id),
        pipeline_stage_id = @stageId,
        collect_notes = @collectNotes,
        require_schedule_return = @requireScheduleReturn,
        require_final_registration = @requireFinalRegistration,
        ask_decision_maker = @askDecisionMaker,
        mark_phone_verified = @markPhoneVerified,
        allowed_next_actions = @allowedNextActions::jsonb,
        status = COALESCE(@status, status),
        updated_at = @now
      WHERE id = @id
    `,
    {
      id,
      technicalId: input.call_technical_result_type_id ?? null,
      commercialId: input.commercial_result_type_id ?? null,
      stageId: input.pipeline_stage_id !== undefined ? input.pipeline_stage_id : existing.pipeline_stage_id,
      collectNotes: input.collect_notes !== undefined ? input.collect_notes : existing.collect_notes,
      requireScheduleReturn:
        input.require_schedule_return !== undefined
          ? input.require_schedule_return
          : existing.require_schedule_return,
      requireFinalRegistration:
        input.require_final_registration !== undefined
          ? input.require_final_registration
          : existing.require_final_registration,
      askDecisionMaker:
        input.ask_decision_maker !== undefined ? input.ask_decision_maker : existing.ask_decision_maker,
      markPhoneVerified:
        input.mark_phone_verified !== undefined ? input.mark_phone_verified : existing.mark_phone_verified,
      allowedNextActions:
        input.allowed_next_actions !== undefined
          ? input.allowed_next_actions != null
            ? JSON.stringify(input.allowed_next_actions)
            : null
          : existing.allowed_next_actions != null
            ? JSON.stringify(existing.allowed_next_actions)
            : null,
      status: input.status ?? null,
      now
    }
  );
}

