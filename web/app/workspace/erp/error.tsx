"use client";

import { ErrorPanel } from "@/components/ErrorPanel";

export default function ErpError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorPanel error={error} retry={retry} title="帳本這一頁暫時打不開" />;
}
