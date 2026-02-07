import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

type CaptureCoords = { x: number; y: number; w: number; h: number }
type CaptureResult = { dataUrl: string; bounds: CaptureCoords }
type CaptureCallback = (result: CaptureResult) => void

const api = {
  startCapture: () => ipcRenderer.send('start-capture'),
  closeCapture: () => ipcRenderer.send('close-capture'),
  doCapture: (coords: CaptureCoords) => ipcRenderer.invoke('do-capture', coords),
  performOcr: (dataUrl: string) => ipcRenderer.invoke('perform-ocr', dataUrl),
  simulateReply: (data: { text: string; focusCoords?: {x:number,y:number}; sendCoords?: {x:number,y:number} }) => ipcRenderer.invoke('simulate-reply', data),
  onCaptureImage: (callback: CaptureCallback) => ipcRenderer.on('capture-image', (_, data: CaptureResult) => callback(data)),
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close')
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
