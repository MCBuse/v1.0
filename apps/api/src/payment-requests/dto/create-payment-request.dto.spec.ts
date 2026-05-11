import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreatePaymentRequestDto } from './create-payment-request.dto';

function validate(input: Record<string, unknown>) {
  return validateSync(plainToInstance(CreatePaymentRequestDto, input), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
}

describe('CreatePaymentRequestDto', () => {
  it('allows dynamic line-item invoices without a top-level amount', () => {
    const errors = validate({
      type: 'dynamic',
      currency: 'USDC',
      description: 'Breakfast',
      lineItems: [
        {
          name: 'Coffee',
          quantity: 2,
          unitAmount: '2000000',
        },
      ],
      expiresInSeconds: 300,
    });

    expect(errors).toEqual([]);
  });

  it('validates amount when an amount-only dynamic invoice provides one', () => {
    const errors = validate({
      type: 'dynamic',
      amount: '14000000',
      currency: 'USDC',
      expiresInSeconds: 300,
    });

    expect(errors).toEqual([]);
  });

  it('rejects malformed amount values when amount is provided', () => {
    const errors = validate({
      type: 'dynamic',
      amount: '14.00',
      currency: 'USDC',
      expiresInSeconds: 300,
    });

    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toMatchObject({
      matches: 'amount must be a non-negative integer string',
    });
  });
});
