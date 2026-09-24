import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Fonts ship inside the app: nothing is fetched from the internet.
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "katex/dist/katex.min.css";
import "./styles.css";
import { App } from "./App";
import { flushAll } from "./store/app";

declare global {
  interface Window {
    /** Called by run_web.py when the window is closing. */
    __nvFlush?: () => Promise<void>;
  }
}
window.__nvFlush = flushAll;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
