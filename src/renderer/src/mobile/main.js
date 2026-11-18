import { jsx as _jsx } from "react/jsx-runtime";
import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { MobileApp } from "./MobileApp";
import "../styles/index.css";
import "./mobile.css";
ReactDOM.createRoot(document.getElementById("root")).render(_jsx(React.StrictMode, { children: _jsx(HashRouter, { children: _jsx(MobileApp, {}) }) }));
