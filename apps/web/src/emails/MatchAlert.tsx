import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { APARTMENT_ATTRIBUTE_LABELS, type ApartmentAttributeKey } from "@apartment-finder/shared";

export type MatchAlertProps = {
  apartmentId: number;
  neighborhood: string | null;
  formattedAddress: string | null;
  rooms: number | null;
  sqm: number | null;
  floor: number | null;
  priceNis: number | null;
  sourceUrl: string | null;
  filtersUrl: string | null;
  matchedAttributes: ApartmentAttributeKey[];
};

const containerStyle = {
  margin: "0 auto",
  padding: "24px 16px",
  maxWidth: "560px",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
};

const cardStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: "12px",
  padding: "20px",
  backgroundColor: "#ffffff",
};

const heading = {
  margin: "0 0 8px 0",
  fontSize: "20px",
  lineHeight: "1.3",
  color: "#111827",
};

const paragraph = {
  margin: "0 0 8px 0",
  fontSize: "15px",
  lineHeight: "1.6",
  color: "#111827",
};

const muted = { color: "#6b7280", fontSize: "13px" };

const ctaButton = {
  backgroundColor: "#111827",
  color: "#ffffff",
  borderRadius: "10px",
  padding: "12px 20px",
  fontSize: "16px",
  fontWeight: 600,
  textDecoration: "none",
  display: "inline-block",
};

const link = { color: "#111827" };

const hr = { border: "none", borderTop: "1px solid #e5e7eb", margin: "16px 0" };

export function MatchAlertEmail(props: MatchAlertProps) {
  const previewLine = buildPreview(props);
  return (
    <Html lang="he" dir="rtl">
      <Head />
      <Preview>{previewLine}</Preview>
      <Body style={{ backgroundColor: "#f9fafb", margin: 0, padding: 0 }}>
        <Container style={containerStyle}>
          <Section style={cardStyle}>
            <Heading as="h1" style={heading}>
              דירה חדשה תואמת לסינונים שלך
            </Heading>

            {props.formattedAddress ? (
              <Text style={paragraph}>{props.formattedAddress}</Text>
            ) : null}

            <Text style={paragraph}>
              <Meta {...props} />
            </Text>

            {props.matchedAttributes.length > 0 ? (
              <>
                <Hr style={hr} />
                <Text style={{ ...paragraph, ...muted }}>תואם לסינונים שלך:</Text>
                <Text style={paragraph}>
                  {props.matchedAttributes
                    .map((k) => APARTMENT_ATTRIBUTE_LABELS[k] ?? k)
                    .join(" · ")}
                </Text>
              </>
            ) : null}

            <Hr style={hr} />

            {props.sourceUrl ? (
              <Section style={{ textAlign: "start" }}>
                <Button href={props.sourceUrl} style={ctaButton}>
                  פתח את המודעה
                </Button>
              </Section>
            ) : null}
          </Section>

          <Section style={{ marginTop: "16px", textAlign: "center" }}>
            <Text style={muted}>
              מקבל/ת התראות יותר מדי?{" "}
              {props.filtersUrl ? (
                <Link href={props.filtersUrl} style={link}>
                  עריכת סינונים
                </Link>
              ) : (
                <>עריכת סינונים</>
              )}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

function Meta(props: MatchAlertProps) {
  const segments: React.ReactNode[] = [];
  if (props.priceNis != null) {
    segments.push(<bdi key="price">{`₪${props.priceNis.toLocaleString("he-IL")}`}</bdi>);
  }
  if (props.rooms != null) {
    segments.push(<bdi key="rooms">{`${props.rooms} חדרים`}</bdi>);
  }
  if (props.sqm != null) {
    segments.push(<bdi key="sqm">{`${props.sqm} מ"ר`}</bdi>);
  }
  if (props.floor != null) {
    segments.push(<bdi key="floor">{`קומה ${props.floor}`}</bdi>);
  }
  if (props.neighborhood) segments.push(props.neighborhood);
  return segments.flatMap((seg, idx) =>
    idx === 0
      ? [<span key={idx}>{seg}</span>]
      : [<span key={`s-${idx}`}>{" · "}</span>, <span key={idx}>{seg}</span>],
  );
}

function buildPreview(props: MatchAlertProps): string {
  const parts: string[] = [];
  if (props.priceNis != null) parts.push(`₪${props.priceNis.toLocaleString("he-IL")}`);
  if (props.rooms != null) parts.push(`${props.rooms} חדרים`);
  if (props.neighborhood) parts.push(props.neighborhood);
  return parts.length > 0 ? parts.join(" · ") : "דירה חדשה תואמת לסינונים שלך";
}
