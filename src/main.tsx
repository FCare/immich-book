import { Buffer } from "buffer";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// @react-pdf/renderer (via pdfkit/fontkit) references the Node.js
// Buffer global while embedding fonts/images into the finished PDF -
// Vite doesn't polyfill Node built-ins the way Webpack used to, so
// without this, PDF generation fails partway through with
// "Buffer is not defined" once it reaches that code path.
if (!("Buffer" in window)) {
  (window as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
