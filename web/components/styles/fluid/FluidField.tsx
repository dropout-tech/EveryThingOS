/**
 * Ocean light between the scene photo and the page. Pure markup; fluid.css paints and moves it.
 * Kept flat (no wrappers) so each layer composites on its own without an extra opacity or mask pass.
 */
export function FluidField() {
  return (
    <div className="fluid-field" aria-hidden="true">
      <span className="fluid-blob fluid-blob-a" />
      <span className="fluid-blob fluid-blob-b" />
      <span className="fluid-rays" />
      <span className="fluid-caustics" />
      <span className="fluid-glow" />
      <span className="fluid-snow" />
    </div>
  );
}
