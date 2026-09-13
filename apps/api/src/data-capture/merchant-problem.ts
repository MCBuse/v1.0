import type { MerchantProblem } from '@repo/shared';

type CaptureException = {
  id: string;
  reasonCode: string;
  severity: string;
  createdAt: Date;
};

const COPY: Record<
  string,
  Pick<MerchantProblem, 'code' | 'title' | 'action'>
> = {
  transfer_failed: {
    code: 'payment_failed',
    title: 'Payment could not be completed',
    action: 'Create a new payment request and ask the customer to try again.',
  },
  reconciliation_delayed: {
    code: 'payment_delayed',
    title: 'Payment confirmation is delayed',
    action: 'Keep this request open while MCBuse checks the payment again.',
  },
  malformed_event: {
    code: 'capture_malformed',
    title: 'A payment record needs review',
    action:
      'No action is required yet. MCBuse is reviewing the captured record.',
  },
  missed_event: {
    code: 'capture_missed',
    title: 'A payment may be missing',
    action: 'Check the receipt list later while MCBuse retries the capture.',
  },
};

export function toMerchantProblem(
  exception: CaptureException,
): MerchantProblem {
  const copy = COPY[exception.reasonCode] ?? {
    code: 'payment_issue' as const,
    title: 'A payment needs attention',
    action: 'Try again later. Contact support if the issue remains visible.',
  };
  const severity: MerchantProblem['severity'] = [
    'info',
    'warning',
    'critical',
  ].includes(exception.severity)
    ? (exception.severity as MerchantProblem['severity'])
    : 'warning';

  return {
    id: exception.id,
    ...copy,
    severity,
    occurredAt: exception.createdAt.toISOString(),
  };
}
