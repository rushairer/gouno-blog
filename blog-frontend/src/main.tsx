import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/tailwind.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./index.css";
import "./styles/redesign.css";
import "./styles/components.css";
import "./styles/design-system-alignment.css";
import "./styles/accessibility.css";
import App from "./App.tsx";
import { GlobalStepUpBoundary } from "./components/auth/GlobalStepUpBoundary";

createRoot(document.getElementById("root")!).render(
  <GlobalStepUpBoundary>
    <StrictMode>
      <App />
    </StrictMode>
  </GlobalStepUpBoundary>,
);
