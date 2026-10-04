/** Roteiro de ligação — telas (v2). Reexporta o módulo principal. */
export {
  DEFAULT_CAPTURE_FIELDS,
  SCRIPT_BLOCK_LABELS,
  branchChoiceContactLayer,
  branchChoiceScheduleMeeting,
  captureFieldRegistrationLabel,
  defaultEmptyCallFlow,
  defaultPostoCredCallFlow,
  draftsToScreenFlow,
  ensureInternalScreenIds,
  enrichScreenLinks,
  newScreenBlock,
  normalizeCallScriptBodyForSave,
  notesFieldsOnScreen,
  parseCallScriptBody,
  renderStepContent,
  screenContactTag,
  screenCreatesContact,
  screenFlowToDrafts,
  screenHasNotesBlock,
  screenHasScheduleBlock,
  sequentialNext,
  serializeCallScriptFlow,
  type ScriptCallFlow,
  type ScriptContactRegisterBlock,
  type ScriptFlowBranchChoice,
  type ScriptFlowCaptureField,
  type ScriptFlowContactLayer,
  type ScriptNotesBlock,
  type ScriptScheduleMeetingBlock,
  type ScriptScreen,
  type ScriptScreenBlock,
  type ScriptScreenDraft,
  type ScriptScreenNavigation,
  type ScriptTextBlock
} from "@/lib/script-flow-screens";

import {
  draftsToScreenFlow,
  ensureInternalScreenIds,
  screenFlowToDrafts,
  type ScriptCallFlow,
  type ScriptScreenDraft
} from "@/lib/script-flow-screens";

/** @deprecated use ScriptCallFlow */
export type ScriptFlow = ScriptCallFlow;

/** @deprecated use ScriptScreenDraft */
export type ScriptFlowStepDraft = ScriptScreenDraft;

/** @deprecated use screenFlowToDrafts */
export const flowToDrafts = screenFlowToDrafts;

/** @deprecated use draftsToScreenFlow */
export const draftsToFlow = draftsToScreenFlow;

/** @deprecated use ensureInternalScreenIds */
export const ensureInternalStepIds = ensureInternalScreenIds;

/** @deprecated use enrichScreenLinks */
export { enrichScreenLinks as enrichLinearNextLinks } from "@/lib/script-flow-screens";
