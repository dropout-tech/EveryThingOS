import { LegalPage } from "@/components/LegalPage";
import { LEGAL_DOCS } from "@/lib/legal";
import { pageMeta } from "@/lib/seo";

const doc = LEGAL_DOCS.dpa;

export const metadata = pageMeta("/dpa", doc.title, doc.summary);

export default function DpaPage() {
  return <LegalPage doc={doc} />;
}
