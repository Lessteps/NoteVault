/**
 * Temas «de repaso general» que ya existen en la vault y cubren a vista de pájaro parte de un área de referencia
 * (p. ej. `5.2 CSS` toca flex, grid, position…, pero sin profundidad de referencia).  * solo puede dejar una entrada en `parcial`, nunca en `cubierto`.
 *
 * `match` se prueba sobre la carpeta del tema (minúsculas, `/`); `touches` son palabras o frases que, si aparecen en
 * el título, las palabras clave o el id de una entrada, la dan por tocada.
 */
export interface OverviewRule {
  match: RegExp;
  touches: string[];
}

export const CURRICULUM_OVERVIEWS: Record<string, OverviewRule[]> = {
  html: [
    {
      match: /\/5\.1 the browser as a runtime/,
      touches: ["doctype", "metadata", "meta", "semantic", "landmarks", "headings", "paragraph", "emphasis", "lists", "ul", "anchor", "anchors", "link", "images", "img", "sections", "skeleton", "form", "table", "script", "css", "global attributes"],
    },
    { match: /\/5\.10 forms and validation/, touches: ["form", "input", "label", "checkbox", "select", "textarea", "validation", "validity", "required", "button", "buttons"] },
    { match: /\/5\.14 accessibility/, touches: ["aria", "accessible", "keyboard", "focus", "alt", "tabindex", "landmarks", "screen reader"] },
    { match: /\/5\.4 javascript in the browser/, touches: ["dataset", "data attributes", "template", "dialog"] },
  ],
  css: [
    {
      match: /\/5\.2 css$/,
      touches: ["selector", "combinator", "specificity", "cascade", "inheritance", "pseudo-element", "pseudo-class", "box model", "box-sizing", "margin", "padding", "width", "display", "float", "position", "z-index", "flex", "flexbox", "grid", "color", "background", "gradient", "font", "line-height", "text-align", "units", "rem", "calc", "clamp", "custom properties", "media", "responsive", "viewport", "transition", "animation", "keyframes", "transform", "border", "shadow", "overflow", "opacity", "outline", "list-style", "reset", "devtools"],
    },
    { match: /\/5\.11 styling/, touches: ["bem", "naming", "tailwind", "utility", "css modules", "scoping", "reset", "normalize", "design tokens", "theming", "preprocessor", "postcss", "css-in-js", "debugging"] },
    { match: /\/5\.3 interface design/, touches: ["typography", "color", "spacing", "fluid", "line-height", "theming"] },
    { match: /\/5\.14 accessibility/, touches: ["focus-visible", "prefers-reduced-motion", "prefers-color-scheme", "outline", "focus ring", "hiding elements"] },
    { match: /\/5\.1 the browser as a runtime/, touches: ["viewport", "linking css"] },
  ],
  "js-reference": [
    { match: /\/2\.2 javascript\/2\.2\.1 /, touches: ["esm", "import", "export", "dynamic import"] },
    { match: /\/2\.2 javascript\/2\.2\.2 /, touches: ["number", "bigint", "floating", "symbol", "parseint", "globalthis"] },
    { match: /\/2\.2 javascript\/2\.2\.3 /, touches: ["operator", "nullish", "optional chaining", "operators"] },
    { match: /\/2\.2 javascript\/2\.2\.4 /, touches: ["call", "apply", "bind", "function", "arguments", "rest"] },
    { match: /\/2\.2 javascript\/2\.2\.5 /, touches: ["error", "throw", "try", "catch", "statements", "switch"] },
    { match: /\/2\.2 javascript\/2\.2\.6 /, touches: ["array"] },
    { match: /\/2\.2 javascript\/2\.2\.7 /, touches: ["object", "map", "set", "weak", "property", "descriptors", "freezing", "prototype"] },
    { match: /\/2\.2 javascript\/2\.2\.8 /, touches: ["string", "template", "unicode"] },
    { match: /\/2\.2 javascript\/2\.2\.9 /, touches: ["prototype", "prototypes", "object"] },
    { match: /\/2\.2 javascript\/2\.2\.10 /, touches: ["iteration", "reduce", "call", "bind", "function"] },
    { match: /\/2\.2 javascript\/2\.2\.11 /, touches: ["iterator", "generator", "iterators", "symbol"] },
    { match: /\/2\.2 javascript\/2\.2\.1[23] /, touches: ["promise", "async", "microtask", "timers", "abort"] },
    { match: /\/2\.2 javascript\/2\.2\.14 /, touches: ["date", "regexp", "regex", "regular", "intl", "math", "random"] },
    { match: /\/2\.2 javascript\/2\.2\.15 /, touches: ["json", "structuredclone"] },
    { match: /\/5\.4 javascript in the browser/, touches: ["dom", "event", "selecting", "classlist", "listener", "delegation", "storage", "observer", "history", "form", "fetch", "console"] },
    { match: /\/5\.8 consuming apis/, touches: ["fetch", "abort", "url", "json", "cors", "websocket"] },
    { match: /\/5\.10 forms and validation/, touches: ["forms in javascript", "formdata", "form"] },
  ],
  java: [],
};
