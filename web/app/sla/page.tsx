import { LegalPage } from "@/components/LegalPage";
import { LEGAL_DOCS } from "@/lib/legal";
import { pageMeta } from "@/lib/seo";

const doc = LEGAL_DOCS.sla;

export const metadata = pageMeta("/sla", doc.title, doc.summary);

export default function SlaPage() {
  return <LegalPage doc={doc} />;
}
