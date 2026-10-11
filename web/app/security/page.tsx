import { LegalPage } from "@/components/LegalPage";
import { LEGAL_DOCS } from "@/lib/legal";
import { pageMeta } from "@/lib/seo";

const doc = LEGAL_DOCS.security;

export const metadata = pageMeta("/security", doc.title, doc.summary);

export default function SecurityPage() {
  return <LegalPage doc={doc} />;
}
