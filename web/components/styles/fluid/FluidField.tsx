/** Layered ocean light that sits between the scene photo and the page. Pure markup; fluid.css paints and moves it. */
export function FluidField() {
  return (
    <div className="fluid-field" aria-hidden="true">
      <div className="fluid-blobs">
        <span className="fluid-blob fluid-blob-a" />
        <span className="fluid-blob fluid-blob-b" />
        <span className="fluid-blob fluid-blob-c" />
        <span className="fluid-blob fluid-blob-d" />
      </div>
      <div className="fluid-surface">
        <span className="fluid-rays" />
        <span className="fluid-caustics fluid-caustics-a" />
        <span className="fluid-caustics fluid-caustics-b" />
      </div>
      <div className="fluid-deep">
        <span className="fluid-glow" />
        <span className="fluid-snow" />
      </div>
    </div>
  );
}
