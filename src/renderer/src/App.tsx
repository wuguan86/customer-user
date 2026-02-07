import React, { useEffect, useMemo, useState } from "react";
import { AppConfig } from "./config";
import Capture from "./components/Capture";
import AppShell, { AppRoute } from "./layout/AppShell";
import AssistantPage from "./pages/AssistantPage";
import LoginPage from "./pages/LoginPage";
import MePage from "./pages/MePage";
import SettingsPage from "./pages/SettingsPage";

type HashRoute = AppRoute | "capture";

const parseHashRoute = (hash: string): HashRoute => {
  const value = (hash || "#/").toLowerCase();
  if (value === "#capture" || value === "#/capture") return "capture";
  if (value.startsWith("#/settings")) return "settings";
  if (value.startsWith("#/me")) return "me";
  return "assistant";
};

function App(): JSX.Element {
  const [hash, setHash] = useState(window.location.hash || "#/");
  const route = useMemo(() => parseHashRoute(hash), [hash]);

  const [backendBaseUrl, setBackendBaseUrl] = useState<string>(
    localStorage.getItem("backendBaseUrl") || AppConfig.apiBaseUrl,
  );
  const [tenantId, setTenantId] = useState<string>(
    localStorage.getItem("tenantId") || AppConfig.defaultTenantId,
  );
  const [userToken, setUserToken] = useState<string>(
    localStorage.getItem("userToken") || "",
  );

  useEffect(() => {
    const handleHashChange = () => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    localStorage.setItem("backendBaseUrl", backendBaseUrl);
  }, [backendBaseUrl]);

  useEffect(() => {
    localStorage.setItem("tenantId", tenantId);
  }, [tenantId]);

  useEffect(() => {
    localStorage.setItem("userToken", userToken);
  }, [userToken]);

  const navigate = (next: HashRoute) => {
    const nextHash = next === "assistant" ? "#/" : `#/${next}`;
    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash;
    }
  };

  if (route === "capture") {
    return <Capture />;
  }

  if (!userToken && route !== 'me') {
    return (
      <LoginPage
        backendBaseUrl={backendBaseUrl}
        tenantId={tenantId}
        onLoginSuccess={(auth) => {
          setUserToken(auth.token);
          setTenantId(auth.tenantId);
          navigate("assistant");
        }}
      />
    );
  }

  const activeRoute: AppRoute = route;

  return (
    <AppShell activeRoute={activeRoute} onNavigate={navigate}>
      {activeRoute === "assistant" && (
        <AssistantPage
          backendBaseUrl={backendBaseUrl}
          tenantId={tenantId}
          userToken={userToken}
          onNavigateSettings={() => navigate("settings")}
          onLogout={() => {
            setUserToken("");
            navigate("assistant");
          }}
        />
      )}
      {activeRoute === "settings" && (
        <SettingsPage
          backendBaseUrl={backendBaseUrl}
          tenantId={tenantId}
          userToken={userToken}
          setUserToken={setUserToken}
        />
      )}
      {activeRoute === "me" && (
        <MePage
          backendBaseUrl={backendBaseUrl}
          tenantId={tenantId}
          userToken={userToken}
          onLogout={() => {
            setUserToken("");
            navigate("assistant");
          }}
        />
      )}
    </AppShell>
  );
}

export default App;
