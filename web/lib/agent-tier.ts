/** Display gate for the right-hand agent. Shown only on the advanced tier. */
export function showAgent(tier: string | null | undefined): boolean {
  return tier?.trim().toLowerCase() === "advanced";
}
