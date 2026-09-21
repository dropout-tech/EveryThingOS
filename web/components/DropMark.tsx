type DropMarkProps = {
  className?: string;
  size?: number;
};

/** 水滴 + 漣漪。顏色跟 currentColor，黑白兩套都能用。 */
export function DropMark({ className, size = 20 }: DropMarkProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      fill="none"
    >
      <ellipse cx="16" cy="26.6" rx="9.2" ry="2.15" stroke="currentColor" strokeOpacity="0.28" strokeWidth="1.15" />
      <ellipse cx="16" cy="24.7" rx="6.1" ry="1.45" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.15" />
      <path
        d="M16 3.1c0 0-8.2 10.6-8.2 16.6C7.8 24.9 11.5 28.6 16 28.6s8.2-3.7 8.2-8.9C24.2 13.7 16 3.1 16 3.1Z"
        fill="currentColor"
      />
      <path
        d="M12.2 11.4c1.4-2.6 3.1-4.8 3.8-6.2 0.1 0.2-6.4 9-6.4 14.6 0 1.3.3 2.5.8 3.6 0-3.8.6-8.8 1.8-12Z"
        fill="#fff"
        fillOpacity="0.38"
      />
      <ellipse cx="13.15" cy="12.05" rx="1.55" ry="2.45" transform="rotate(-22 13.15 12.05)" fill="#fff" fillOpacity="0.7" />
      <ellipse cx="13.55" cy="10.2" rx="0.55" ry="0.75" transform="rotate(-22 13.55 10.2)" fill="#fff" fillOpacity="0.9" />
    </svg>
  );
}
