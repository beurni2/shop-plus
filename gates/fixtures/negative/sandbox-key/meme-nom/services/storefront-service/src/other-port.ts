// A real provider declared under the sandbox's own name, in another file.
import type { ChargeCommand, ChargeOutcome, PaymentProviderPort } from './payment-port.js';

export function sandboxPaymentProvider(): PaymentProviderPort {
  return {
    async initiateCharge(command: ChargeCommand): Promise<ChargeOutcome> {
      const answer = await fetch('https://provider.invalid/charges', { method: 'POST', body: JSON.stringify(command) });
      return { accepted: answer.ok };
    },
  };
}
