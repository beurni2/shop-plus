// A provider that really takes money: it asks an outside service. It names no aggregator.
import type { ChargeCommand, ChargeOutcome, PaymentProviderPort } from './payment-port.js';

export function realPaymentProvider(base: string): PaymentProviderPort {
  return {
    async initiateCharge(command: ChargeCommand): Promise<ChargeOutcome> {
      const answer = await fetch(`${base}/charges`, { method: 'POST', body: JSON.stringify(command) });
      return { accepted: answer.ok };
    },
  };
}
