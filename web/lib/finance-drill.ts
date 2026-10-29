/** ERPNext desk URL for one posted document. No desk URL means there is nowhere to open it. */
export function voucherHref(doctype?: string | null, name?: string | null, deskUrl?: string | null): string | undefined {
  const base = typeof deskUrl === "string" ? deskUrl.trim().replace(/\/+$/, "") : "";
  const doc = typeof doctype === "string" ? doctype.trim() : "";
  const id = typeof name === "string" ? name.trim() : "";
  if (!base || !doc || !id) return undefined;
  const slug = doc.replace(/ /g, "_").replace(/-/g, "_").toLowerCase().replace(/_/g, "-");
  return `${base}/app/${slug}/${id}`;
}
