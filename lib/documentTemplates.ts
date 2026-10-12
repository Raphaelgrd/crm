"use client";

import { useCallback, useEffect, useState } from "react";
import { createCollectionStore } from "@/lib/firebase";

export type DocumentType = "NDA" | "MOU" | "Autre";

export interface DocumentTemplate {
  id: string;
  name: string;
  type: DocumentType;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export type DocumentTemplateInput = Omit<DocumentTemplate, "id" | "createdAt" | "updatedAt">;

const store = createCollectionStore<DocumentTemplate>("documentTemplates");

export function useDocumentTemplates() {
  const [templates, setTemplates] = useState<DocumentTemplate[]>(store.get());
  const [loading, setLoading] = useState(!store.ready());

  useEffect(
    () =>
      store.subscribe(() => {
        setTemplates(store.get());
        setLoading(false);
      }),
    [],
  );

  const saveTemplate = useCallback(
    async (input: DocumentTemplateInput, id?: string): Promise<DocumentTemplate> => {
      const now = new Date().toISOString();
      const existing = id ? store.get().find((t) => t.id === id) : undefined;
      const tpl: DocumentTemplate = {
        ...input,
        id: id ?? `tpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      await store.set(tpl);
      return tpl;
    },
    [],
  );

  const deleteTemplate = useCallback((id: string) => store.remove(id), []);

  return { templates, loading, saveTemplate, deleteTemplate };
}

export const DEFAULT_NDA_TEMPLATE = `ACCORD DE CONFIDENTIALITÉ (NDA)

Entre les soussignés :

{{notre_societe}}, société [forme juridique], immatriculée sous le numéro [SIRET/RCS], dont le siège social est situé au {{notre_adresse}}, représentée par {{signataire}},
ci-après désignée « la Société »,

ET

{{client_societe}}, représentée par {{client_nom_complet}} ({{client_email}}),
ci-après désignée « le Partenaire »,

Ensemble dénommées « les Parties ».

───────────────────────────────────────────

ARTICLE 1 – OBJET

{{objet_accord}}

ARTICLE 2 – INFORMATIONS CONFIDENTIELLES

Sont considérées comme confidentielles toutes les informations échangées dans le cadre de {{objet_accord}}, qu'elles soient de nature commerciale, financière, technique ou stratégique, quel que soit leur support.

ARTICLE 3 – OBLIGATIONS DES PARTIES

Chaque Partie s'engage à :
• Ne divulguer aucune information confidentielle à des tiers sans accord écrit préalable ;
• Utiliser ces informations uniquement dans le cadre défini à l'article 1 ;
• Prendre toute mesure raisonnable pour assurer leur protection.

ARTICLE 4 – DURÉE

Le présent accord prend effet à compter du {{date}} et est conclu pour une durée de {{duree_mois}} mois.

ARTICLE 5 – LOI APPLICABLE ET JURIDICTION

Le présent accord est régi par le droit {{juridiction}}. Tout litige sera soumis aux tribunaux compétents de [ville].

───────────────────────────────────────────

Fait en deux exemplaires originaux, le {{date}}.

Pour la Société                           Pour le Partenaire
{{signataire}}                            {{client_nom_complet}}

_____________________                     _____________________`;

export const DEFAULT_MOU_TEMPLATE = `MÉMORANDUM D'ENTENTE (MOU)

Entre les soussignés :

{{notre_societe}}, dont le siège social est situé au {{notre_adresse}}, représentée par {{signataire}},
ci-après désignée « la Partie A »,

ET

{{client_societe}}, représentée par {{client_nom_complet}} ({{client_email}}),
ci-après désignée « la Partie B »,

Ensemble dénommées « les Parties ».

───────────────────────────────────────────

1. CONTEXTE ET OBJET

{{objet_accord}}

Les Parties expriment leur intention commune d'explorer et de développer une collaboration dans ce cadre.

2. ENGAGEMENTS DES PARTIES

2.1 La Partie A s'engage à :
{{engagement_partie_a}}

2.2 La Partie B s'engage à :
{{engagement_partie_b}}

3. DURÉE

Ce mémorandum prend effet à compter du {{date}} et est valide pour une période de {{duree_mois}} mois, renouvelable par accord mutuel écrit.

4. NATURE NON CONTRAIGNANTE

Le présent mémorandum est une déclaration d'intention commune. Il ne constitue pas un contrat juridiquement contraignant, sauf disposition expresse contraire convenue par écrit entre les Parties.

5. CONFIDENTIALITÉ

Les Parties s'engagent à maintenir la confidentialité de toute information échangée dans le cadre de ce mémorandum.

6. LOI APPLICABLE

Ce mémorandum est régi par le droit {{juridiction}}.

───────────────────────────────────────────

Fait en deux exemplaires, le {{date}}.

Pour la Partie A                          Pour la Partie B
{{signataire}}                            {{client_nom_complet}}

_____________________                     _____________________`;
