import { LegalPdfDocumentPage } from "./LegalPdfDocumentPage";
type TermsPageProps = { cartCount: number };
export function TermsPage({ cartCount }: TermsPageProps) { return <LegalPdfDocumentPage cartCount={cartCount} title="Terms" lead="Add the terms and conditions for the new webshop before launch." pdfUrl="" pdfTitle="" />; }
