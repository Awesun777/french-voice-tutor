/**
 * Map getUserMedia / mic-related DOMExceptions to copy a learner can act on.
 * Browsers report blocked mic access with messages like "The request is not
 * allowed by the user agent or the platform in the current context" — useless
 * on a phone, where the fix is a Safari site-settings toggle.
 */
export function micErrorMessage(err: unknown, fallback: string): string {
  const e = err as { name?: string; message?: string } | null | undefined;
  switch (e?.name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Microphone access was blocked. Allow it in your browser settings (iPhone: tap aA in the address bar → Website Settings → Microphone → Allow) and try again.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No microphone was found on this device.";
    case "NotReadableError":
      return "The microphone is in use by another app. Close it and try again.";
    default:
      return e?.message ?? fallback;
  }
}

/**
 * Request the microphone inside the click gesture, then release it right away.
 *
 * iOS Safari only honors getUserMedia while the tap's transient user
 * activation is alive; any network await before the request consumes it and
 * the call rejects with NotAllowedError. Calling this as the first statement
 * of a click handler surfaces the permission prompt immediately and grants
 * the page mic access, so a later getUserMedia (e.g. inside the ElevenLabs
 * SDK) succeeds even after network round-trips. The stream is stopped at
 * once to avoid iOS's dual-capture quirk when the SDK opens its own stream.
 */
export async function prewarmMicrophone(): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  stream.getTracks().forEach((t) => t.stop());
}
