"use client";

import { useCallback, useEffect, useState } from "react";

// ⚠️ Couche de données locale (localStorage), même pattern que lib/contacts.ts :
// API async calquée sur Firestore pour brancher Firebase sans toucher aux pages.

export type BlockType = "heading" | "text" | "image" | "button" | "divider" | "spacer";

export interface HeadingProps {
  text: string;
  align: "left" | "center" | "right";
  color: string;
  fontSize: number;
}
export interface TextProps {
  text: string;
  align: "left" | "center" | "right";
  color: string;
  fontSize: number;
}
export interface ImageProps {
  src: string;
  alt: string;
  width: number; // % de la largeur du mail
  align: "left" | "center" | "right";
  href: string;
}
export interface ButtonProps {
  label: string;
  href: string;
  bgColor: string;
  textColor: string;
  align: "left" | "center" | "right";
  radius: number;
}
export interface DividerProps {
  color: string;
  thickness: number;
}
export interface SpacerProps {
  height: number;
}

export type BlockProps =
  | HeadingProps
  | TextProps
  | ImageProps
  | ButtonProps
  | DividerProps
  | SpacerProps;

export interface EmailBlock {
  id: string;
  type: BlockType;
  props: BlockProps;
}

export interface TemplateSettings {
  bgColor: string; // fond de la page
  contentBgColor: string; // fond de la zone 600px
}

export type TemplateType = "Email" | "SMS" | "Note";

export interface EmailTemplate {
  id: string;
  name: string;
  type: TemplateType;
  subject: string;
  blocks: EmailBlock[];
  settings: TemplateSettings;
  createdAt: string;
  updatedAt: string;
}

export const VARIABLES = [
  { token: "{{civility}}", label: "Civilité" },
  { token: "{{firstName}}", label: "Prénom" },
  { token: "{{lastName}}", label: "Nom" },
  { token: "{{companyName}}", label: "Société" },
  { token: "{{email}}", label: "Email" },
  { token: "{{phone}}", label: "Téléphone" },
];

export const SAMPLE_DATA: Record<string, string> = {
  civility: "M.",
  firstName: "Jean",
  lastName: "Dupont",
  companyName: "Acme SAS",
  email: "jean.dupont@example.com",
  phone: "06 12 34 56 78",
};

const STORAGE_KEY = "netforce.templates";

function makeId(prefix = "b") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const DEFAULT_SETTINGS: TemplateSettings = {
  bgColor: "#f1f5f9",
  contentBgColor: "#ffffff",
};

export function defaultProps(type: BlockType): BlockProps {
  switch (type) {
    case "heading":
      return { text: "Votre titre ici", align: "left", color: "#0f172a", fontSize: 24 };
    case "text":
      return {
        text: "Bonjour {{firstName}},\n\nVotre texte ici…",
        align: "left",
        color: "#334155",
        fontSize: 14,
      };
    case "image":
      return { src: "", alt: "", width: 100, align: "center", href: "" };
    case "button":
      return {
        label: "En savoir plus",
        href: "https://",
        bgColor: "#2563eb",
        textColor: "#ffffff",
        align: "center",
        radius: 8,
      };
    case "divider":
      return { color: "#e2e8f0", thickness: 1 };
    case "spacer":
      return { height: 24 };
  }
}

export function makeBlock(type: BlockType): EmailBlock {
  return { id: makeId(), type, props: defaultProps(type) };
}

/** Résumé texte d'un template pour la carte de la galerie. */
export function templatePreview(t: EmailTemplate): string {
  for (const b of t.blocks) {
    if (b.type === "text" || b.type === "heading") {
      const text = (b.props as TextProps).text.replace(/\s+/g, " ").trim();
      if (text) return text.slice(0, 140);
    }
  }
  return "";
}

// --- Rendu HTML email (tableaux + styles inline, compatible clients mail) ---

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function nl2br(s: string) {
  return esc(s).replace(/\n/g, "<br/>");
}

const FONT = "font-family:Arial,Helvetica,sans-serif;";

function renderBlock(b: EmailBlock): string {
  switch (b.type) {
    case "heading": {
      const p = b.props as HeadingProps;
      return `<tr><td style="padding:12px 32px;${FONT}font-size:${p.fontSize}px;font-weight:bold;color:${p.color};text-align:${p.align};line-height:1.3;">${nl2br(p.text)}</td></tr>`;
    }
    case "text": {
      const p = b.props as TextProps;
      return `<tr><td style="padding:8px 32px;${FONT}font-size:${p.fontSize}px;color:${p.color};text-align:${p.align};line-height:1.6;">${nl2br(p.text)}</td></tr>`;
    }
    case "image": {
      const p = b.props as ImageProps;
      if (!p.src) return "";
      const img = `<img src="${esc(p.src)}" alt="${esc(p.alt)}" width="${Math.round((600 - 64) * (p.width / 100))}" style="display:block;max-width:100%;height:auto;border:0;"/>`;
      const content = p.href ? `<a href="${esc(p.href)}" target="_blank">${img}</a>` : img;
      return `<tr><td align="${p.align}" style="padding:8px 32px;">${content}</td></tr>`;
    }
    case "button": {
      const p = b.props as ButtonProps;
      return `<tr><td align="${p.align}" style="padding:12px 32px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${p.bgColor}" style="border-radius:${p.radius}px;"><a href="${esc(p.href)}" target="_blank" style="display:inline-block;padding:12px 28px;${FONT}font-size:14px;font-weight:bold;color:${p.textColor};text-decoration:none;border-radius:${p.radius}px;">${esc(p.label)}</a></td></tr></table></td></tr>`;
    }
    case "divider": {
      const p = b.props as DividerProps;
      return `<tr><td style="padding:12px 32px;"><div style="border-top:${p.thickness}px solid ${p.color};font-size:0;line-height:0;">&nbsp;</div></td></tr>`;
    }
    case "spacer": {
      const p = b.props as SpacerProps;
      return `<tr><td style="height:${p.height}px;font-size:0;line-height:0;">&nbsp;</td></tr>`;
    }
  }
}

export function renderEmailHtml(t: EmailTemplate): string {
  const rows = t.blocks.map(renderBlock).join("\n");
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(t.subject || t.name)}</title>
</head>
<body style="margin:0;padding:0;background-color:${t.settings.bgColor};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${t.settings.bgColor}">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${t.settings.contentBgColor}" style="max-width:600px;width:100%;border-radius:8px;overflow:hidden;">
<tr><td style="height:16px;font-size:0;">&nbsp;</td></tr>
${rows}
<tr><td style="height:16px;font-size:0;">&nbsp;</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** Remplace les variables {{x}} par les valeurs fournies (ou l'exemple). */
export function fillVariables(html: string, data: Record<string, string> = SAMPLE_DATA): string {
  return html.replace(/\{\{(\w+)\}\}/g, (m, key: string) => data[key] ?? m);
}

// --- Store ---

function seedTemplates(): EmailTemplate[] {
  const now = new Date().toISOString();
  const mk = (name: string, subject: string, text: string): EmailTemplate => ({
    id: makeId("t"),
    name,
    type: "Email",
    subject,
    blocks: [{ id: makeId(), type: "text", props: { text, align: "left", color: "#334155", fontSize: 14 } }],
    settings: { ...DEFAULT_SETTINGS },
    createdAt: now,
    updatedAt: now,
  });
  return [
    mk(
      "merci",
      "Merci — votre accord de confidentialité est signé",
      "Bonjour {{civility}} {{lastName}},\n\nNous vous confirmons la bonne réception de votre accord de confidentialité (NDA), dûment signé.",
    ),
    mk(
      "email_signature",
      "signature",
      "Bonjour {{lastName}},\n\nNous vous remercions de l'intérêt porté par {{companyName}} à un partenariat avec nous.",
    ),
    mk(
      "relance MOU EN",
      "Milipol Singapore – Territory Exclusivity Confirmation",
      "{{firstName}} {{lastName}},\n\nIn a context of strong acceleration in global demand for our G.I.E solution (Electric Impulse Glove)…",
    ),
    mk(
      "relance MOU FR",
      "Présence Milipol Singapour et confirmation MOU",
      "{{firstName}} {{lastName}},\n\nDans un contexte de forte accélération de la demande internationale pour notre solution G.I.E…",
    ),
  ];
}

function load(): EmailTemplate[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as EmailTemplate[];
  } catch {
    /* ignore */
  }
  const seeded = seedTemplates();
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
  return seeded;
}

function save(list: EmailTemplate[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function useTemplates() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setTemplates(load());
    setLoading(false);
  }, []);

  const persist = useCallback((next: EmailTemplate[]) => {
    setTemplates(next);
    save(next);
  }, []);

  const getTemplate = useCallback(
    async (id: string): Promise<EmailTemplate | null> =>
      load().find((t) => t.id === id) ?? null,
    [],
  );

  const addTemplate = useCallback(
    async (input: Omit<EmailTemplate, "id" | "createdAt" | "updatedAt">): Promise<EmailTemplate> => {
      const now = new Date().toISOString();
      const t: EmailTemplate = { ...input, id: makeId("t"), createdAt: now, updatedAt: now };
      persist([t, ...load()]);
      return t;
    },
    [persist],
  );

  const updateTemplate = useCallback(
    async (id: string, input: Partial<Omit<EmailTemplate, "id" | "createdAt">>): Promise<void> => {
      persist(
        load().map((t) =>
          t.id === id ? { ...t, ...input, updatedAt: new Date().toISOString() } : t,
        ),
      );
    },
    [persist],
  );

  const deleteTemplate = useCallback(
    async (id: string): Promise<void> => {
      persist(load().filter((t) => t.id !== id));
    },
    [persist],
  );

  const duplicateTemplate = useCallback(
    async (id: string): Promise<EmailTemplate | null> => {
      const source = load().find((t) => t.id === id);
      if (!source) return null;
      const now = new Date().toISOString();
      const copy: EmailTemplate = {
        ...source,
        id: makeId("t"),
        name: `${source.name} (copie)`,
        blocks: source.blocks.map((b) => ({ ...b, id: makeId(), props: { ...b.props } })),
        createdAt: now,
        updatedAt: now,
      };
      persist([copy, ...load()]);
      return copy;
    },
    [persist],
  );

  return {
    templates,
    loading,
    getTemplate,
    addTemplate,
    updateTemplate,
    deleteTemplate,
    duplicateTemplate,
  };
}
