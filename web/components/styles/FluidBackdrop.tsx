import { GlassPointer } from "../GlassPointer";
import { OceanColumn } from "../OceanColumn";
import { FluidField } from "./fluid/FluidField";
import { FluidMotion } from "./fluid/FluidMotion";

export function FluidBackdrop() {
  return (
    <>
      <GlassPointer />
      <OceanColumn />
      <FluidField />
      <FluidMotion />
    </>
  );
}
