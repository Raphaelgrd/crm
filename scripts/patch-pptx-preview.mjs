// Correctif de pptx-preview (aperçu PowerPoint de la Data Room), appliqué après chaque installation (postinstall) :
// un graphique dont le titre est automatique affichait le texte chinois « 图表标题 » (« titre du graphique »).
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const files = ["node_modules/pptx-preview/dist/pptx-preview.es.js", "node_modules/pptx-preview/dist/pptx-preview.umd.js"];
for (const f of files) {
  if (!existsSync(f)) continue;
  const src = readFileSync(f, "utf8");
  const out = src.replaceAll('||"图表标题"', '||""');
  if (out !== src) {
    writeFileSync(f, out);
    console.log(`[patch-pptx-preview] ${f} corrigé`);
  }
}
