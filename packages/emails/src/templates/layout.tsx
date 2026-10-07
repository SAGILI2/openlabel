import { Body, Button, Container, Head, Hr, Html, Preview, Section, Text } from "@react-email/components";
import type { ReactNode } from "react";

/** Brand blue from the app's design tokens; dark enough to pass contrast on white in either mode. */
const BRAND = "#2b59c3";

const styles = {
  body: {
    backgroundColor: "#f4f5f7",
    margin: 0,
    padding: "24px 0",
    fontFamily: "Inter, Segoe UI, Arial, sans-serif",
  },
  container: {
    backgroundColor: "#ffffff",
    border: "1px solid #e3e5ea",
    borderRadius: 8,
    maxWidth: 520,
    padding: 32,
  },
  wordmark: { color: "#14171f", fontSize: 15, fontWeight: 700, margin: "0 0 24px" },
  text: { color: "#14171f", fontSize: 15, lineHeight: "24px", margin: "0 0 16px" },
  button: {
    backgroundColor: BRAND,
    borderRadius: 6,
    color: "#ffffff",
    fontSize: 14,
    fontWeight: 600,
    padding: "10px 18px",
    textDecoration: "none",
  },
  muted: { color: "#5b6170", fontSize: 13, lineHeight: "20px", margin: "0 0 8px" },
  link: { color: BRAND, fontSize: 13, lineHeight: "20px", wordBreak: "break-all" as const, margin: 0 },
  hr: { borderColor: "#e3e5ea", margin: "24px 0" },
};

/** Shared frame: wordmark, body, one call-to-action, the raw link as a fallback, and a footer note. */
export function Layout({
  preview,
  children,
  action,
  footer,
}: {
  preview: string;
  children: ReactNode;
  action: { label: string; href: string };
  footer: string;
}) {
  return (
    <Html lang="en">
      <Head>
        {/* Light only: clients that force dark mode invert these colours consistently. */}
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Text style={styles.wordmark}>OpenLabel</Text>
          {children}
          <Section style={{ margin: "24px 0" }}>
            <Button href={action.href} style={styles.button}>
              {action.label}
            </Button>
          </Section>
          <Text style={styles.muted}>If the button doesn't work, paste this link into your browser:</Text>
          <Text style={styles.link}>{action.href}</Text>
          <Hr style={styles.hr} />
          <Text style={styles.muted}>{footer}</Text>
        </Container>
      </Body>
    </Html>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <Text style={styles.text}>{children}</Text>;
}
