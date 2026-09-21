import { BrandMark } from "@/components/BrandMark";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-5">
      <BrandMark />
      <h1 className="text-2xl">這頁找不到</h1>
      <Link href="/" className="text-teal hover:underline">
        回首頁
      </Link>
    </div>
  );
}
