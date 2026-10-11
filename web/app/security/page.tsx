import { LegalPage } from "@/components/LegalPage";
import { LEGAL_DOCS } from "@/lib/legal";

const doc = LEGAL_DOCS.security;

export const metadata = { title: doc.title };

export default function SecurityPage() {
  return <LegalPage doc={doc} />;
}
