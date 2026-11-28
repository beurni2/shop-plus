// THE BREAK: a real provider is wired, the key and the workflow are gone,
// but this line still reads 'sandbox'.
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
