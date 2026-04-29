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
import { LOCALE_DIRECTIONS, type Locale } from "@/i18n/locales";

export type SignInCodeStrings = {
  preview: string;
  heading: string;
  instruction: string;
  expiry: string;
};

export type SignInCodeProps = {
  otp: string;
  locale: Locale;
  strings: SignInCodeStrings;
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

export function SignInCodeEmail({ otp, locale, strings }: SignInCodeProps) {
  const dir = LOCALE_DIRECTIONS[locale];
  return (
    <Html lang={locale} dir={dir}>
      <Head />
      <Preview>{strings.preview}</Preview>
      <Body style={{ backgroundColor: "#f9fafb", margin: 0, padding: 0 }}>
        <Container style={containerStyle}>
          <Section style={cardStyle}>
            <Heading as="h1" style={heading}>
              {strings.heading}
            </Heading>
            <Text style={paragraph}>{strings.instruction}</Text>
            <Text style={codePill}>
              <bdi>{otp}</bdi>
            </Text>
            <Text style={muted}>{strings.expiry}</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
