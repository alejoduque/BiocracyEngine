// dome-render-preload.js — the one door out of the page for dome-render.js
// The page (renderMode.ts) hands each domemaster here; the main process
// writes it to ffmpeg and resolves once ffmpeg has taken it, so the page
// never runs ahead of the encoder.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("__renderOut", {
  frame: (data, width, height) => ipcRenderer.invoke("dome-frame", data, width, height),
});
