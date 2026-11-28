import { sandboxPaymentProvider, type ChargeOutcome } from '../src/payment-port.js';

export function charge(orderId: string, amount: number): Promise<ChargeOutcome> {
  return sandboxPaymentProvider().initiateCharge({ orderId, amount });
}
