import { PageContainer } from "../../components/PageContainer";
type PaymentInfoPageProps = { cartCount: number };
export function PaymentInfoPage({ cartCount }: PaymentInfoPageProps) { return <PageContainer cartCount={cartCount} eyebrow="Payment" title="Payment Information" lead="Bank transfer is included as the default placeholder payment method." className="legal-page"><article className="legal-document-panel"><p>Payment information placeholder.</p></article></PageContainer>; }
