import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import * as serviceWorkerRegistration from "./lib/serviceWorkerRegistration";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Failed to find the root element");
}

createRoot(rootElement).render(<App />);

// Register service worker for PWA functionality
serviceWorkerRegistration.register({
  onSuccess: (registration) => {
    console.log('[App] Service worker registered successfully');
  },
  onUpdate: (registration) => {
    console.log('[App] New content available, please refresh');
    // Could show a toast notification here
  },
  onOfflineReady: () => {
    console.log('[App] App is ready for offline use');
  },
});
