import { buildEntries } from "./helpers";

/** Atomic Design y sistemas de diseño aplicados a Frontend: átomos, moléculas, organismos, plantillas y páginas. */
export const ATOMIC_DESIGN_ENTRIES = buildEntries("atomic-design", {
  "Design tokens and foundations": [
    ["design-tokens", "Design tokens - colors, spacing, typography and elevation", "e", "color palettes, semantic tokens, spacing scales, typography scales, z-index, elevation, tokens in CSS custom properties", "design tokens, css variables, spacing scale, color system"],
    ["design-principles", "Design principles and component contracts", "r", "consistency, composability, single responsibility, accessibility in tokens, contract-driven components", "design system principles, component contract"],
  ],
  Atoms: [
    ["button-atom", "Buttons and interactive primitives", "e", "button variants, sizes, icon buttons, states (hover, active, disabled, focus-visible, loading)", "button component, interactive primitive"],
    ["input-atom", "Form input primitives", "e", "text input, number input, checkbox, radio, toggle switch, textarea, select primitive", "input primitive, checkbox, radio, form inputs"],
    ["badge-tag-atom", "Badges, tags and chips", "r", "status badge, removable tag, filter chip, counter pill", "badge, tag, chip, status pill"],
    ["icon-typography-atom", "Typography and icon primitives", "e", "heading component, text body, caption, icon wrapper, svg icon integration", "typography component, icon component"],
  ],
  Molecules: [
    ["form-field-molecule", "Form fields with labels, hints and errors", "e", "label association, error message, helper text, required indicator, aria-describedby", "form field, field label, error message"],
    ["search-bar-molecule", "Search bars and input groups", "r", "search input, clear button, submit icon, debounced search triggers", "search bar, input group"],
    ["card-molecule", "Content cards and summary units", "e", "card container, card header, body, footer, interactive card link", "card component, summary unit"],
    ["alert-toast-molecule", "Alerts, toasts and notifications", "r", "info, success, warning, error banners, dismiss action, toast container", "alert component, toast notification"],
  ],
  Organisms: [
    ["navigation-header-organism", "Navigation header and top bars", "e", "brand logo, navigation links, search, action buttons, mobile hamburger menu", "navbar, header organism, app bar"],
    ["data-table-organism", "Data tables and lists", "e", "sortable headers, pagination controls, row selection, empty state, loading skeleton", "table organism, data table, pagination"],
    ["modal-drawer-organism", "Modals, dialogs and side drawers", "e", "modal backdrop, focus trap, escape key handling, accessible dialog, side drawer", "modal dialog, drawer organism, dialog component"],
    ["form-organism", "Complex composite forms and multi-step flows", "r", "form layout, validation summary, step progression, submit state, reset handling", "form organism, composite form, multi step"],
  ],
  "Templates and Pages": [
    ["template-scaffolding", "Page templates and responsive layout shells", "e", "sidebar layout, dashboard grid, full-width canvas, sticky footers, responsive breakpoints", "template layout, dashboard shell, page template"],
    ["concrete-pages", "Concrete pages and real-state composition", "e", "mock data injection, loading state, error boundary, empty states, real user flows", "concrete page, view composition, page layout"],
    ["design-system-docs", "Component documentation and design system handoff", "r", "storybook/styleguide integration, prop documentation, visual regression testing, changelog", "storybook, design system docs, styleguide"],
  ],
});
