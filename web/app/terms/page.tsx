import { LegalPage } from "@/components/LegalPage";
import { LEGAL_DOCS } from "@/lib/legal";

const doc = LEGAL_DOCS.terms;

export const metadata = { title: doc.title };

export default function TermsPage() {
  return <LegalPage doc={doc} />;
}
