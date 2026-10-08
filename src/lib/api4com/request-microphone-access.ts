export type MicrophoneAccessResult =
  | { ok: true }
  | { ok: false; message: string };

/** Pede permissão de microfone antes do SIP; libera o stream em seguida (só para o prompt). */
export async function requestMicrophoneAccess(): Promise<MicrophoneAccessResult> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return { ok: false, message: "Este navegador não permite acesso ao microfone." };
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    for (const track of stream.getTracks()) track.stop();
    return { ok: true };
  } catch (e) {
    const name = e instanceof DOMException ? e.name : "";
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      return {
        ok: false,
        message:
          "Permissão de microfone negada. Autorize o microfone para este site e clique em Conectar ramal novamente."
      };
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return {
        ok: false,
        message: "Nenhum microfone encontrado. Conecte um dispositivo de áudio e tente conectar de novo."
      };
    }
    return {
      ok: false,
      message: "Não foi possível acessar o microfone. Verifique o navegador e conecte o ramal novamente."
    };
  }
}
