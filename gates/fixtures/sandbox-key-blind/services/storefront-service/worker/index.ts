// THE BLINDNESS: the bundle's entry no longer reaches the code that charges,
// so the gate sees no provider at all and must say so rather than pass.
import { webhookAuthorized, type AuthEnv } from './auth.js';

export function confirm(env: AuthEnv, key: string): boolean {
  return webhookAuthorized(key, env);
}
