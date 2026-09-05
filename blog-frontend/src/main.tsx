import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Link } from "react-router-dom";
import { ThemeProvider, NavigationProvider, TooltipProvider } from "@gouno/ui";
import "./styles/tailwind.css";
import "./styles/accessibility.css";
import App from "./App";
import { GlobalStepUpBoundary } from "./components/auth/GlobalStepUpBoundary";
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider
      brand={/^\/admin(?:\/|$)/.test(location.pathname) ? "blog-admin" : "blog"}
      storageKey="gouno-blog:theme"
    >
      <NavigationProvider link={Link}>
        <TooltipProvider>
          <GlobalStepUpBoundary>
            <App />
          </GlobalStepUpBoundary>
        </TooltipProvider>
      </NavigationProvider>
    </ThemeProvider>
  </StrictMode>,
);
