import type { CreateOfframpSessionResponse } from '@/features/offramp';

const sessions = new Map<string, CreateOfframpSessionResponse>();

export function setOfframpWidgetSession(session: CreateOfframpSessionResponse): void {
  sessions.set(session.transactionId, session);
}

export function takeOfframpWidgetSession(
  transactionId: string,
): CreateOfframpSessionResponse | undefined {
  const session = sessions.get(transactionId);
  sessions.delete(transactionId);
  return session;
}
