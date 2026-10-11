import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";

type FieldProps = {
  label: ReactNode;
  children: ReactElement<{ id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean }>;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
};

/** Label above, hint and error below, wired to the control with ids. */
export function Field({ label, children, hint, error, className = "" }: FieldProps) {
  const id = useId();
  const controlId = children.props.id ?? `${id}-control`;
  const describedBy = [hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined;
  const control = isValidElement(children)
    ? cloneElement(children, { id: controlId, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })
    : children;

  return (
    <div className={className}>
      <label htmlFor={controlId} className="field-label">
        {label}
      </label>
      {control}
      {hint ? (
        <p id={`${id}-hint`} className="field-hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
