import { LegalPage } from "@/components/LegalPage";
import { LEGAL_DOCS } from "@/lib/legal";

const doc = LEGAL_DOCS.dpa;

export const metadata = { title: doc.title };

export default function DpaPage() {
  return <LegalPage doc={doc} />;
}
