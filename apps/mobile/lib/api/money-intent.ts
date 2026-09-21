import * as SecureStore from "expo-secure-store";
import { randomUUID } from "expo-crypto";
import { http } from "./client";

export async function finishMoneyIntent(kind: string) {
  const next = pending.then(async () => {
    const all: Record<string, Intent> = JSON.parse(
      (await SecureStore.getItemAsync(MONEY_INTENT_KEY)) ?? "{}",
    );
    for (const scope of Object.keys(all))
      if (scope.endsWith(`:${kind}`)) delete all[scope];
    await SecureStore.setItemAsync(MONEY_INTENT_KEY, JSON.stringify(all));
  });
  pending = next.catch(() => undefined);
  await next;
}

export const MONEY_INTENT_KEY = "mcbuse.money.intents";
type Intent = { key: string; fingerprint: string };
let pending = Promise.resolve();

/** Serialize storage updates; lost responses and application restarts reuse the intent. */
export async function moneyIntent(
  kind: string,
  input: unknown,
): Promise<Intent> {
  const user = await http.get<{ id: string }>("/users/me");
  let intent!: Intent;
  const next = pending.then(async () => {
    const all: Record<string, Intent> = JSON.parse(
      (await SecureStore.getItemAsync(MONEY_INTENT_KEY)) ?? "{}",
    );
    const scope = `${user.id}:${kind}`;
    const fingerprint = JSON.stringify(input);
    intent =
      all[scope]?.fingerprint === fingerprint
        ? all[scope]
        : { key: randomUUID(), fingerprint };
    all[scope] = intent;
    await SecureStore.setItemAsync(MONEY_INTENT_KEY, JSON.stringify(all));
  });
  pending = next.catch(() => undefined);
  await next;
  return intent;
}
