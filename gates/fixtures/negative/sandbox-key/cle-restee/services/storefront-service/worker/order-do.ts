import type { ChargeOutcome } from '../src/payment-port.js';
import { realPaymentProvider } from '../src/real-provider.js';

export function charge(orderId: string, amount: number): Promise<ChargeOutcome> {
  return realPaymentProvider('https://provider.invalid').initiateCharge({ orderId, amount });
}
