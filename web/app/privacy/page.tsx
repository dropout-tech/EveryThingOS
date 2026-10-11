import { LegalPage } from "@/components/LegalPage";
import { LEGAL_DOCS } from "@/lib/legal";

const doc = LEGAL_DOCS.privacy;

export const metadata = { title: doc.title };

export default function PrivacyPage() {
  return <LegalPage doc={doc} />;
}
