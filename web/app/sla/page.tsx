import { LegalPage } from "@/components/LegalPage";
import { LEGAL_DOCS } from "@/lib/legal";

const doc = LEGAL_DOCS.sla;

export const metadata = { title: doc.title };

export default function SlaPage() {
  return <LegalPage doc={doc} />;
}
