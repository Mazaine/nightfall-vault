import { PageContainer } from "../../components/PageContainer";
type ImpressumPageProps = { cartCount: number };
export function ImpressumPage({ cartCount }: ImpressumPageProps) { return <PageContainer cartCount={cartCount} eyebrow="Legal" title="Impressum" lead="Add operator and hosting provider details before production launch." className="legal-page"><article className="legal-document-panel"><p>Operator details placeholder.</p></article></PageContainer>; }
