// THE BREAK: a real provider, imported under the sandbox's own name.
import type { ChargeOutcome } from '../src/payment-port.js';
import { realPaymentProvider as sandboxPaymentProvider } from '../src/real-provider.js';

export function charge(orderId: string, amount: number): Promise<ChargeOutcome> {
  return sandboxPaymentProvider('https://provider.invalid').initiateCharge({ orderId, amount });
}
