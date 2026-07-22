import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./AuthContext";
import { NotificationProvider } from "./NotificationContext";
import { AuctionRealtimeProvider } from "./AuctionRealtimeContext";
import "./styles/index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <NotificationProvider><AuctionRealtimeProvider><App /></AuctionRealtimeProvider></NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
