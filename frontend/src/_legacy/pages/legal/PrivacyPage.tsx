import { LegalPdfDocumentPage } from "./LegalPdfDocumentPage";
type PrivacyPageProps = { cartCount: number };
export function PrivacyPage({ cartCount }: PrivacyPageProps) { return <LegalPdfDocumentPage cartCount={cartCount} title="Privacy Policy" lead="Add the privacy policy for the new webshop before launch." pdfUrl="" pdfTitle="" />; }
