import React from "react";
import { createRoot } from "react-dom/client";
import { V2App } from "./app/v2/V2App";
import "./app/global.css";

function boot() {
    const el = document.getElementById("root");
    if (!el) throw new Error("Root element #root not found");
    createRoot(el).render(<V2App />);
}

boot();
