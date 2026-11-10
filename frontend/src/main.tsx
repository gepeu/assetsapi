import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import "./index.css";
import { AssetPage } from "./pages/AssetPage";
import { AssetsPage } from "./pages/AssetsPage";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename="/ui">
      <Routes>
        <Route element={<Layout />}>
          <Route path="/assets" element={<AssetsPage />} />
          <Route path="/assets/:slug" element={<AssetPage />} />
          <Route path="*" element={<Navigate to="/assets" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
