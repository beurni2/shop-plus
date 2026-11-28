// Stands in for the storefront Worker, cut to what the gate reads.
import { webhookAuthorized, type AuthEnv } from './auth.js';
import { charge } from './order-do.js';

export async function confirm(env: AuthEnv, key: string, orderId: string): Promise<boolean> {
  if (!webhookAuthorized(key, env)) return false;
  return (await charge(orderId, 1000)).accepted;
}
