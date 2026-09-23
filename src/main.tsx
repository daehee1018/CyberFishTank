import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { AppProvider } from "./context/AppContext";

// 설치 가능한 웹앱(PWA)이 되려면 서비스 워커 등록이 필요하다.
// 미지원 브라우저에서도 앱 자체는 그대로 동작해야 하니 조용히 실패시킨다.
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").catch((error) => {
            console.error("❌ 서비스 워커 등록 실패:", error);
        });
    });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <AppProvider>
            <App />
        </AppProvider>
    </React.StrictMode>
);