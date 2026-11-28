// THE BREAK: a real provider is wired and the fact is flipped, but the tool's
// key is still read here.
export interface AuthEnv {
  readonly PAYMENT_WEBHOOK_SECRET?: string;
  readonly SANDBOX_CONFIRM_SECRET?: string;
}

export function webhookAuthorized(key: string, env: AuthEnv): boolean {
  const provider = key.length > 0 && key === env.PAYMENT_WEBHOOK_SECRET;
  const tool = key.length > 0 && key === env.SANDBOX_CONFIRM_SECRET;
  return provider || tool;
}
