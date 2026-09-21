const PREFIX = "mcbuse:intent:";
/** Persist only intent IDs/input fingerprints, never tokens or assessment content. */
export function operationIntent(
  merchantId: string,
  kind: string,
  input: object,
) {
  const key = `${PREFIX}${merchantId}:${kind}`;
  const fingerprint = JSON.stringify(input);
  const previous = localStorage.getItem(key);
  if (previous) {
    try {
      const saved = JSON.parse(previous);
      if (saved.fingerprint === fingerprint && typeof saved.id === "string")
        return saved.id as string;
    } catch {
      /* Replace corrupt local state. */
    }
  }
  const id = crypto.randomUUID();
  localStorage.setItem(key, JSON.stringify({ id, fingerprint }));
  return id;
}
export function finishOperationIntent(merchantId: string, kind: string) {
  localStorage.removeItem(`${PREFIX}${merchantId}:${kind}`);
}
export function clearOperationIntents() {
  for (const key of Object.keys(localStorage))
    if (key.startsWith(PREFIX)) localStorage.removeItem(key);
}
