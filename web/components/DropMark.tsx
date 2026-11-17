type DropMarkProps = {
  className?: string;
  size?: number;
};

/**
 * 實心水滴。顏色跟 currentColor，黑白兩套都能用。
 * 路徑要跟 `app/icon.svg` 裡那一顆一樣，縮小到分頁圖示還認得。
 */
export function DropMark({ className, size = 20 }: DropMarkProps) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M16 3.4C16 3.4 8.4 12.6 8.4 18.8 8.4 23.6 11.8 27.4 16 27.4s7.6-3.8 7.6-8.6C23.6 12.6 16 3.4 16 3.4z"
      />
    </svg>
  );
}
