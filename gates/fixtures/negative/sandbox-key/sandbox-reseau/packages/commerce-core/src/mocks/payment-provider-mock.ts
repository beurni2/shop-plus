// Stands in for the vault's certified mock: the same path and class, no network.
export class MockPaymentProvider {
  private readonly charged = new Set<string>();

  initiateCharge(orderId: string, amount: number): boolean {
    if (amount <= 0 || this.charged.has(orderId)) return false;
    this.charged.add(orderId);
    return true;
  }
}
