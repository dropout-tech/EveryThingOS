import { LegalPage } from "@/components/LegalPage";
import { LEGAL_DOCS } from "@/lib/legal";
import { pageMeta } from "@/lib/seo";

const doc = LEGAL_DOCS.privacy;

export const metadata = pageMeta("/privacy", doc.title, doc.summary);

export default function PrivacyPage() {
  return <LegalPage doc={doc} />;
}
