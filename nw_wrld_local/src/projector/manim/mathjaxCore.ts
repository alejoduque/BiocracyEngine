// mathjaxCore.ts — MathJax, loaded only by the slots that typeset
// Imported through a dynamic import() in tex.ts, so webpack puts MathJax in a
// chunk of its own and the other slots never download it.
//
// TeX → SVG with the glyphs as plain paths (fontCache "none": no <use>), the
// form three's SVGLoader can read. Packages: base, ams, and html for
// \class{key}{…}, which is how a formula names its parts — manim's isolated
// substrings.

import { mathjax } from "mathjax-full/js/mathjax.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import "mathjax-full/js/input/tex/base/BaseConfiguration.js";
import "mathjax-full/js/input/tex/ams/AmsConfiguration.js";
import "mathjax-full/js/input/tex/html/HtmlConfiguration.js";

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const doc = mathjax.document("", {
  InputJax: new TeX({ packages: ["base", "ams", "html"] }),
  OutputJax: new SVG({ fontCache: "none" }),
});

/** The <svg> for one display-mode formula, as a string. */
export function texToSvg(tex: string): string {
  const node = doc.convert(tex, { display: true });
  return adaptor.innerHTML(node);
}
