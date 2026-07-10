import { PageContainer } from "../../components/PageContainer";
type CookiesPageProps = { cartCount: number };
export function CookiesPage({ cartCount }: CookiesPageProps) { return <PageContainer cartCount={cartCount} eyebrow="Legal" title="Cookie Policy" lead="Add cookie details for the new webshop before production launch." className="legal-page"><article className="legal-document-panel"><p>Cookie policy placeholder.</p></article></PageContainer>; }
