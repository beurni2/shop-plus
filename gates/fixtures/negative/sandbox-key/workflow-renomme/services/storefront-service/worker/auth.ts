export interface AuthEnv {
  readonly PAYMENT_WEBHOOK_SECRET?: string;
}

export function webhookAuthorized(key: string, env: AuthEnv): boolean {
  return key.length > 0 && key === env.PAYMENT_WEBHOOK_SECRET;
}
