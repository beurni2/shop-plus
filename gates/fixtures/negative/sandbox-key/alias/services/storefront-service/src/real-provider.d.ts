// A real provider whose body the gate cannot read, the shape a provider's
// compiled kit arrives in: only its declaration says what it is.
import type { PaymentProviderPort } from './payment-port.js';

export declare function realPaymentProvider(base: string): PaymentProviderPort;
