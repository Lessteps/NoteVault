import { buildEntries } from "./helpers";

/** HTML: elementos, atributos y APIs de formularios agrupados por categoría (un tema = un grupo pequeño). */
export const HTML_ENTRIES = buildEntries("html", {
  "Document and metadata": [
    ["skeleton", "Document skeleton - doctype, html, head and body", "e", "<!DOCTYPE html>, <html lang>, <head>, <body>, character encoding, standards vs quirks mode", "doctype, document skeleton, html skeleton"],
    ["metadata", "Metadata - title, meta, base and link", "e", "<title>, <meta charset>, <meta name=viewport>, <meta name=description>, <meta http-equiv>, <base href>, <link rel>", "head metadata, meta tags, viewport meta"],
    ["social-seo", "SEO and social metadata", "r", "canonical link, robots meta, Open Graph tags, Twitter card tags, theme-color, favicons and icons, web app manifest", "seo, open graph, favicon, canonical"],
    ["parsing-rules", "Parsing rules - void elements, nesting and entities", "r", "void elements, optional end tags, content models, block vs inline nesting, character references (&amp; &lt; &nbsp; &copy;), whitespace collapsing, HTML validator", "void elements, character references, html entities, content model"],
  ],
  "Scripting and loading": [
    ["css-js-linking", "Linking CSS and JavaScript", "e", "<style>, <link rel=stylesheet>, <script src>, defer, async, type=module, nomodule, <noscript>, script placement", "script defer, async script, link stylesheet, script tag"],
    ["resource-hints", "Resource hints and loading priority", "o", "preload, prefetch, preconnect, dns-prefetch, modulepreload, fetchpriority, as, crossorigin", "preload, preconnect, prefetch, resource hints"],
  ],
  "Text semantics": [
    ["headings", "Headings and document outline", "e", "<h1>-<h6>, <hgroup>, heading levels, one h1 per page, outline and screen readers", "headings, h1, document outline"],
    ["paragraphs-breaks", "Paragraphs, line breaks and separators", "e", "<p>, <br>, <wbr>, <hr>, <pre>, whitespace handling", "paragraph, line break, pre"],
    ["emphasis", "Emphasis and text-level styling elements", "e", "<em>, <strong>, <b>, <i>, <u>, <mark>, <small>, <s>, <del>, <ins>", "em strong, emphasis, mark, del ins"],
    ["technical-text", "Technical text - code, kbd, samp, var, abbr, sub, sup", "r", "<code>, <kbd>, <samp>, <var>, <abbr title>, <dfn>, <sub>, <sup>", "code element, kbd, abbr, sub sup"],
    ["quotes", "Quotations and citations", "r", "<blockquote cite>, <q>, <cite>, <address>", "blockquote, citation, address"],
    ["time-data-i18n", "Time, data and bidirectional text", "o", "<time datetime>, <data value>, <bdi>, <bdo>, <ruby> <rt> <rp>, lang, dir, <span>", "time element, ruby, bdi, lang attribute"],
  ],
  "Sectioning and structure": [
    ["landmarks", "Page landmarks - header, nav, main, footer, aside", "e", "<header>, <nav>, <main>, <footer>, <aside>, <search>, one main per page", "landmarks, header footer, main element, semantic html"],
    ["sections", "Sections and articles", "e", "<section>, <article>, <div>, <span>, when to use semantic vs generic containers", "section article, div vs section, semantic elements"],
  ],
  Lists: [
    ["ordered-unordered", "Lists - ul, ol and li", "e", "<ul>, <ol>, <li>, ol start/reversed/type, li value, nested lists", "ul ol li, lists"],
    ["description-menu", "Description lists and menus", "o", "<dl>, <dt>, <dd>, <menu>, grouping name/value pairs", "dl dt dd, description list"],
  ],
  "Links and navigation": [
    ["anchors", "Links - the a element and its attributes", "e", "<a href>, absolute vs relative URLs, fragments, mailto: and tel:, target, rel (noopener noreferrer nofollow), download, hreflang, referrerpolicy", "anchor, hyperlink, a href, target blank"],
    ["navigation-patterns", "Navigation patterns", "r", "nav with lists, skip links, breadcrumbs, aria-current, link text rules, in-page navigation", "breadcrumb, skip link, navigation menu"],
  ],
  "Media and embedded content": [
    ["images", "Images - img and its attributes", "e", "<img src alt>, width, height, loading=lazy, decoding, srcset, sizes, fetchpriority, crossorigin", "img element, image alt, lazy loading images"],
    ["responsive-images", "Responsive images - picture and source", "r", "<picture>, <source media type srcset>, art direction, resolution switching, format fallbacks", "picture element, srcset, responsive images"],
    ["audio-video", "Audio and video", "r", "<audio>, <video>, <source>, <track>, controls, autoplay, loop, muted, preload, poster, playsinline", "video element, audio element, track captions"],
    ["figure", "Figures and captions", "r", "<figure>, <figcaption>, grouping media with captions", "figure figcaption"],
    ["svg-canvas", "Inline SVG, canvas and MathML", "o", "inline <svg>, viewBox, <canvas>, <math>, when to use each", "inline svg, canvas element"],
    ["iframes", "Embedding - iframe, embed and object", "r", "<iframe src srcdoc>, sandbox, allow, loading=lazy, referrerpolicy, <embed>, <object>", "iframe, sandbox, embed"],
    ["image-maps", "Image maps", "o", "<map>, <area>, usemap, shape, coords", "image map, area element"],
  ],
  Tables: [
    ["table-structure", "Tables - structure and semantics", "e", "<table>, <caption>, <thead>, <tbody>, <tfoot>, <tr>, <th>, <td>", "html table, thead tbody, table element"],
    ["table-cells", "Table cells, spans and accessibility", "r", "colspan, rowspan, scope, headers, <col>, <colgroup>, accessible data tables", "colspan rowspan, table headers scope"],
  ],
  "Forms and inputs": [
    ["form-element", "The form element and submission", "e", "<form>, action, method, enctype, target, autocomplete, novalidate, accept-charset, name/value serialisation", "form element, form submission, get vs post form"],
    ["labels-fieldsets", "Labels, fieldset and legend", "e", "<label for>, implicit labels, <fieldset>, <legend>, disabled on fieldset", "label for, fieldset legend, form labels"],
    ["text-inputs", "Text inputs and textarea", "e", "type=text/password/email/url/tel/search, <textarea>, name, value, placeholder, readonly, maxlength, minlength, size, rows, cols, wrap", "text input, textarea, input types, placeholder"],
    ["number-date-inputs", "Number, range, date and color inputs", "r", "type=number/range/date/time/datetime-local/month/week/color, min, max, step", "date input, number input, range input, color input"],
    ["choice-inputs", "Choice inputs - checkbox, radio, select", "e", "type=checkbox/radio, checked, <select>, <option>, <optgroup>, <datalist>, multiple, size", "checkbox, radio buttons, select element, datalist"],
    ["buttons-file-hidden", "Buttons, file and hidden inputs", "e", "<button type>, type=submit/reset/button/image, type=file, accept, capture, type=hidden, formaction, formmethod", "button element, file input, hidden input, submit button"],
    ["output-progress", "Output, progress and meter", "o", "<output>, <progress value max>, <meter low high optimum>", "progress element, meter, output element"],
    ["input-attributes", "Input hint attributes", "r", "autocomplete tokens, inputmode, enterkeyhint, autofocus, list, form, name, dirname, spellcheck, autocapitalize", "autocomplete attribute, inputmode, autofocus"],
  ],
  Validation: [
    ["constraint-validation", "Built-in constraint validation", "e", "required, pattern, min, max, minlength, maxlength, type mismatch, step, novalidate, formnovalidate", "form validation, required attribute, pattern attribute"],
    ["validity-api", "Constraint Validation API", "r", "ValidityState, validity.valid/valueMissing/typeMismatch, setCustomValidity, checkValidity, reportValidity, :invalid and :valid", "validity api, setcustomvalidity, checkvalidity"],
  ],
  "Interactive elements": [
    ["details-dialog", "Details, summary and dialog", "r", "<details>, <summary>, open, name (exclusive accordion), <dialog>, showModal(), show(), close(), ::backdrop, returnValue", "details summary, dialog element, modal dialog"],
    ["popover", "Popover API", "o", "popover attribute, popovertarget, popovertargetaction, showPopover(), hidePopover(), auto vs manual", "popover api, popover attribute"],
    ["editing-dragging", "Editable, draggable and inert content", "o", "contenteditable, draggable, hidden, hidden=until-found, inert", "contenteditable, draggable, inert"],
  ],
  "Accessibility and ARIA": [
    ["aria-roles", "ARIA roles and landmarks", "r", "role, landmark roles, widget roles, document structure roles, the first rule of ARIA", "aria role, aria landmarks, role attribute"],
    ["aria-states", "ARIA states and properties", "r", "aria-label, aria-labelledby, aria-describedby, aria-hidden, aria-expanded, aria-controls, aria-live, aria-current, aria-pressed, aria-selected, aria-checked, aria-disabled, aria-invalid, aria-required", "aria attributes, aria-label, aria-live, aria-expanded"],
    ["keyboard-focus", "Keyboard access and focus management", "e", "tabindex 0/-1, natural tab order, focus(), autofocus, accesskey, focus traps, visible focus", "tabindex, keyboard navigation, focus management"],
    ["accessible-names", "Accessible names and text alternatives", "e", "alt text rules, empty alt, accessible name computation, visually hidden text, title vs label", "alt text, accessible name, screen reader text"],
  ],
  "Global attributes": [
    ["core-global", "Core global attributes", "e", "id, class, style, title, lang, dir, hidden, translate", "global attributes, id class, lang attribute"],
    ["data-attributes", "Custom data attributes", "e", "data-*, dataset, camelCase mapping, reading and writing from JS and CSS", "data attributes, dataset"],
    ["other-global", "Other global attributes", "o", "tabindex, accesskey, contenteditable, spellcheck, draggable, inputmode, nonce, slot, is, part, popover, inert, enterkeyhint", "global attribute list, spellcheck, nonce"],
    ["event-attributes", "Inline event handler attributes", "o", "onclick, onchange, onsubmit, onload, why they are discouraged, CSP interaction", "inline event handlers, onclick attribute"],
  ],
  "Web components and structured data": [
    ["template-slot", "Template and slot", "r", "<template>, <slot>, slot attribute, content cloning, declarative shadow DOM", "template element, slot element"],
    ["custom-elements", "Custom elements in markup", "o", "autonomous custom elements, naming rules, is= customised built-ins, :defined, fallback content", "custom elements, web components"],
    ["structured-data", "Microdata and JSON-LD", "o", "itemscope, itemtype, itemprop, <script type=application/ld+json>, schema.org basics", "json-ld, microdata, schema.org"],
  ],
});
