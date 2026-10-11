import type { UiStyle } from "@/lib/style";
import { FluidBackdrop } from "./FluidBackdrop";
import { MinimalBackdrop } from "./MinimalBackdrop";
import { SocialBackdrop } from "./SocialBackdrop";

export function StyleBackdrop({ style }: { style: UiStyle }) {
  if (style === "minimal") return <MinimalBackdrop />;
  if (style === "social") return <SocialBackdrop />;
  return <FluidBackdrop />;
}
