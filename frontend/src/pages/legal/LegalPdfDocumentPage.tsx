import { PageContainer } from "../../components/PageContainer";
import "./LegalPage.css";

type LegalPdfDocumentPageProps = { cartCount: number; title: string; lead: string; pdfUrl: string; pdfTitle: string };
export function LegalPdfDocumentPage({ cartCount, title, lead }: LegalPdfDocumentPageProps) { return <PageContainer cartCount={cartCount} eyebrow="Legal" title={title} lead={lead} className="legal-page"><article className="legal-document-panel"><p>Provide project-specific legal text or document links before production launch.</p></article></PageContainer>; }
