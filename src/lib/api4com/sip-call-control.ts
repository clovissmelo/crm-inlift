/** Controle de pernas SIP do libwebphone (sem UI do callList). */

const autoAnswerTimerIds = new WeakMap<object, number[]>();

export function clearLibwebphoneAutoAnswerTimers(call: LibWebphoneInstance): void {
  const ids = autoAnswerTimerIds.get(call);
  if (!ids) return;
  for (const id of ids) window.clearTimeout(id);
  autoAnswerTimersDelete(call);
}

function autoAnswerTimersDelete(call: LibWebphoneInstance): void {
  autoAnswerTimerIds.delete(call);
}

export function scheduleLibwebphoneAutoAnswer(
  currentCall: LibWebphoneInstance,
  attemptAnswer: () => void
): void {
  clearLibwebphoneAutoAnswerTimers(currentCall);
  attemptAnswer();
  const timers: number[] = [];
  for (const ms of [120, 400, 900, 1800]) {
    timers.push(
      window.setTimeout(() => {
        if (currentCall.isEnded?.()) return;
        if (currentCall.isEstablished?.()) return;
        attemptAnswer();
      }, ms)
    );
  }
  autoAnswerTimerIds.set(currentCall, timers);
}

export function libwebphoneHasActiveSession(wp: LibWebphoneInstance | null): boolean {
  if (!wp?.getCallList) return false;
  const calls = wp.getCallList()?.getCalls?.() ?? [];
  return calls.some((call) => call.hasSession?.() && !call.isEnded?.());
}

export function terminateAllLibwebphoneCalls(wp: LibWebphoneInstance | null): void {
  if (!wp?.getCallList) return;
  const calls = [...(wp.getCallList()?.getCalls?.() ?? [])];
  for (const call of calls) {
    clearLibwebphoneAutoAnswerTimers(call);
    try {
      if (!call.isEnded?.()) {
        call.hangup?.();
        call.terminate?.();
        call.reject?.();
      }
    } catch {
      /* ignore */
    }
  }
}
