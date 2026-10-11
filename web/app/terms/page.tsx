import { LegalPage } from "@/components/LegalPage";
import { LEGAL_DOCS } from "@/lib/legal";
import { pageMeta } from "@/lib/seo";

const doc = LEGAL_DOCS.terms;

export const metadata = pageMeta("/terms", doc.title, doc.summary);

export default function TermsPage() {
  return <LegalPage doc={doc} />;
}
