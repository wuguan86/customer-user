"use strict";
const electron = require("electron");
const preload = require("@electron-toolkit/preload");
const api = {
  startCapture: () => electron.ipcRenderer.send("start-capture"),
  closeCapture: () => electron.ipcRenderer.send("close-capture"),
  doCapture: (coords) => electron.ipcRenderer.invoke("do-capture", coords),
  performOcr: (dataUrl) => electron.ipcRenderer.invoke("perform-ocr", dataUrl),
  simulateReply: (data) => electron.ipcRenderer.invoke("simulate-reply", data),
  onCaptureImage: (callback) => electron.ipcRenderer.on("capture-image", (_, data) => callback(data)),
  minimizeWindow: () => electron.ipcRenderer.send("window-minimize"),
  maximizeWindow: () => electron.ipcRenderer.send("window-maximize"),
  closeWindow: () => electron.ipcRenderer.send("window-close")
};
if (process.contextIsolated) {
  try {
    electron.contextBridge.exposeInMainWorld("electron", preload.electronAPI);
    electron.contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(error);
  }
} else {
  window.electron = preload.electronAPI;
  window.api = api;
}
