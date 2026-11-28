import { PAYMENT_PROVIDER_KIND } from '../src/payment-port.js';

export interface AuthEnv {
  readonly PAYMENT_WEBHOOK_SECRET?: string;
  readonly SANDBOX_CONFIRM_SECRET?: string;
}

export function webhookAuthorized(key: string, env: AuthEnv): boolean {
  const provider = key.length > 0 && key === env.PAYMENT_WEBHOOK_SECRET;
  const tool = key.length > 0 && key === env.SANDBOX_CONFIRM_SECRET;
  return provider || (PAYMENT_PROVIDER_KIND === 'sandbox' && tool);
}
