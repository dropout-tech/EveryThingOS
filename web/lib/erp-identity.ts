/**
 * ERPNext is not this product's login.
 * A missing OAuth client must not become the shared integration user.
 */
export function erpIdentityRefusal(erp: { oauth?: unknown } | undefined): string {
  if (!erp?.oauth) return "沒有 OAuth client，不再使用共用整合帳號";
  return "登入已改為平台帳號，不再把 ERPNext 當成身份";
}
