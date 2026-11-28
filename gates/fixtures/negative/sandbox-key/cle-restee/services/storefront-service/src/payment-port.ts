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

export const PAYMENT_PROVIDER_KIND = 'reel' as const;
