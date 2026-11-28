import { MockPaymentProvider } from '@shop-plus/commerce-core';

export interface ChargeCommand {
  readonly orderId: string;
  readonly amount: number;
}

export interface ChargeOutcome {
  readonly accepted: boolean;
}

export interface PaymentProviderPort {
  initiateCharge(command: ChargeCommand): Promise<ChargeOutcome>;
}

export const PAYMENT_PROVIDER_KIND = 'sandbox' as const;

export function sandboxPaymentProvider(): PaymentProviderPort {
  const mock = new MockPaymentProvider();
  return {
    initiateCharge(command: ChargeCommand): Promise<ChargeOutcome> {
      return Promise.resolve({ accepted: mock.initiateCharge(command.orderId, command.amount) });
    },
  };
}
