import { render, toPlainText } from "@react-email/render";
import { createElement, type ReactElement } from "react";
import { templates, type TemplateName } from "./templates/index.js";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** Validates the payload and renders HTML plus a plain-text alternative. */
export async function renderEmail(name: TemplateName, payload: unknown): Promise<RenderedEmail> {
  // Each entry's schema, subject and body agree; TypeScript can't pair them across the union.
  const template = templates[name] as unknown as {
    schema: { parse: (v: unknown) => Record<string, unknown> };
    subject: (p: Record<string, unknown>) => string;
    Body: (p: Record<string, unknown>) => ReactElement;
  };
  const props = template.schema.parse(payload);
  const html = await render(createElement(template.Body, props));
  return { subject: template.subject(props), html, text: toPlainText(html) };
}

export function isTemplateName(name: unknown): name is TemplateName {
  return typeof name === "string" && Object.hasOwn(templates, name);
}
