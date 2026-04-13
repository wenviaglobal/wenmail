import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { ThemeContext, useThemeProvider } from "./hooks/use-theme";
import { LocaleContext, useLocaleProvider } from "./hooks/use-locale";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

function Root() {
  const themeCtx = useThemeProvider();
  const localeCtx = useLocaleProvider();
  return (
    <ThemeContext.Provider value={themeCtx}>
      <LocaleContext.Provider value={localeCtx}>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </LocaleContext.Provider>
    </ThemeContext.Provider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
