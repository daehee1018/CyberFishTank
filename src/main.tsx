import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./desktop.css";
import "./mobile.css";
import { AppProvider } from "./context/AppContext";

import { registerPwa } from './services/pwa';
import PwaExperience from './components/PwaExperience';
import AppStartup from './components/AppStartup';
import './pwa.css';
import './theme.css';

registerPwa();

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <AppProvider>
            <AppStartup />
            <PwaExperience />
            <App />
        </AppProvider>
    </React.StrictMode>
);
