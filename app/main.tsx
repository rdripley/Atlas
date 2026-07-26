import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import AtlasApp from "./atlas/AtlasApp";
import "./globals.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Atlas root element was not found.");
}

createRoot(root).render(
  <StrictMode>
    <AtlasApp />
  </StrictMode>,
);
