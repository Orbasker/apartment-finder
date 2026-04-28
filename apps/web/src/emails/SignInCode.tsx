import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export type SignInCodeProps = {
  otp: string;
  expiresInMinutes: number;
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
  padding: "24px",
  backgroundColor: "#ffffff",
};

const heading = {
  margin: "0 0 12px 0",
  fontSize: "20px",
  lineHeight: "1.3",
  color: "#111827",
};

const paragraph = {
  margin: "0 0 12px 0",
  fontSize: "15px",
  lineHeight: "1.6",
  color: "#111827",
};

const muted = {
  margin: "12px 0 0 0",
  color: "#6b7280",
  fontSize: "13px",
  lineHeight: "1.6",
};

const codePill = {
  display: "inline-block",
  margin: "8px 0",
  padding: "14px 22px",
  fontSize: "32px",
  fontWeight: 700 as const,
  letterSpacing: "8px",
  backgroundColor: "#f3f4f6",
  borderRadius: "10px",
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
  color: "#111827",
};

export function SignInCodeEmail({ otp, expiresInMinutes }: SignInCodeProps) {
  return (
    <Html lang="he" dir="rtl">
      <Head />
      <Preview>{`קוד הכניסה שלך: ${otp}`}</Preview>
      <Body style={{ backgroundColor: "#f9fafb", margin: 0, padding: 0 }}>
        <Container style={containerStyle}>
          <Section style={cardStyle}>
            <Heading as="h1" style={heading}>
              קוד הכניסה ל־Apartment Finder
            </Heading>
            <Text style={paragraph}>הזן/י את הקוד הבא בעמוד הכניסה:</Text>
            <Text style={codePill}>
              <bdi>{otp}</bdi>
            </Text>
            <Text style={muted}>
              הקוד תקף ל־<bdi>{expiresInMinutes}</bdi> דקות. אם לא ביקשת קוד כניסה, אפשר להתעלם
              מהמייל.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
