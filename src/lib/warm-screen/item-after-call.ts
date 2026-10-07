import { completeWarmScreenItem } from "@/lib/warm-screen/executions";
import {
  getNextRegisteredPhoneForWarmItem,
  resumeWarmScreenItemForNextPhone
} from "@/lib/warm-screen/phone-round";

export async function finishWarmScreenItemAfterPhoneAttempt(input: {
  itemId: number;
  executionId: number;
  clientId: number;
  answered: boolean;
  callRowId: number;
}) {
  if (input.answered) {
    await completeWarmScreenItem({
      itemId: input.itemId,
      executionId: input.executionId,
      status: "completed_warmed",
      callRowId: input.callRowId
    });
    return;
  }

  const next = await getNextRegisteredPhoneForWarmItem(input.clientId, input.executionId, input.itemId);
  if (next) {
    await resumeWarmScreenItemForNextPhone({
      itemId: input.itemId,
      executionId: input.executionId
    });
    return;
  }

  await completeWarmScreenItem({
    itemId: input.itemId,
    executionId: input.executionId,
    status: "completed_error",
    callRowId: input.callRowId
  });
}
