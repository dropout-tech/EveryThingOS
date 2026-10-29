import { formatSlip, type SlipInput } from "@/lib/slip";

export function SlipText(props: SlipInput) {
  return <p className="mt-1 whitespace-pre-line text-xs text-cream-dim">{formatSlip(props)}</p>;
}
