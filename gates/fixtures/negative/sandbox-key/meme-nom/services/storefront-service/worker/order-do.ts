// THE BREAK: the provider comes from a function that only shares the sandbox's name.
import { sandboxPaymentProvider } from '../src/other-port.js';
import type { ChargeOutcome } from '../src/payment-port.js';

export function charge(orderId: string, amount: number): Promise<ChargeOutcome> {
  return sandboxPaymentProvider().initiateCharge({ orderId, amount });
}
