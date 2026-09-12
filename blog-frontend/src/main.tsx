import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Link } from "react-router-dom";
import { NavigationProvider, TooltipProvider } from "@gouno/ui/core";
import { ThemeProvider } from "@gouno/ui/theme";
import "./styles/tailwind.css";
import "./styles/accessibility.css";
import App from "./App";
import { GlobalStepUpBoundary } from "./components/auth/GlobalStepUpBoundary";
import { AppFeedbackProvider } from "./components/feedback/AppFeedbackProvider";
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider
      brand={/^\/admin(?:\/|$)/.test(location.pathname) ? "blog-admin" : "blog"}
      storageKey="gouno-blog:theme"
    >
      <NavigationProvider link={Link}>
        <TooltipProvider>
          <AppFeedbackProvider>
            <GlobalStepUpBoundary>
              <App />
            </GlobalStepUpBoundary>
          </AppFeedbackProvider>
        </TooltipProvider>
      </NavigationProvider>
    </ThemeProvider>
  </StrictMode>,
);
