import { app, shell, BrowserWindow, ipcMain, desktopCapturer, screen } from 'electron'
import { join, dirname } from 'path'
import { writeFile, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import { spawn } from 'child_process'
import os from 'os'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

let mainWindow: BrowserWindow | null = null
let captureWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    frame: false, // Disable native title bar
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: false
    }
  })

  // IPC handlers for custom title bar
  ipcMain.on('window-minimize', () => {
    mainWindow?.minimize()
  })

  ipcMain.on('window-maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow?.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })

  ipcMain.on('window-close', () => {
    mainWindow?.close()
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createCaptureWindow(): void {
  const { width, height } = screen.getPrimaryDisplay().bounds

  captureWindow = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    fullscreen: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  captureWindow.setIgnoreMouseEvents(false)
  captureWindow.setAlwaysOnTop(true, 'screen-saver')
  captureWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  captureWindow.once('ready-to-show', () => {
    captureWindow?.show()
    captureWindow?.focus()
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    captureWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/#/capture`)
  } else {
    captureWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'capture' })
  }
}

ipcMain.on('start-capture', () => {
  if (!captureWindow) {
    createCaptureWindow()
  }
})

ipcMain.on('close-capture', () => {
  if (captureWindow) {
    captureWindow.close()
    captureWindow = null
  }
})

ipcMain.handle('do-capture', async (_, coords) => {
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width, height } = primaryDisplay.size
  const scaleFactor = primaryDisplay.scaleFactor

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width, height }
  })

  const primarySource = sources[0]

  if (primarySource) {
    const cropRect = {
      x: Math.max(0, Math.round(coords.x * scaleFactor)),
      y: Math.max(0, Math.round(coords.y * scaleFactor)),
      width: Math.max(1, Math.round(coords.w * scaleFactor)),
      height: Math.max(1, Math.round(coords.h * scaleFactor))
    }
    const image = primarySource.thumbnail.crop(cropRect)
    const dataUrl = image.toDataURL()
    
    let isManual = false
    if (captureWindow) {
      captureWindow.close()
      captureWindow = null
      isManual = true
    }

    if (isManual) {
      mainWindow?.webContents.send('capture-image', { dataUrl, bounds: coords })
    }
    
    return { dataUrl, bounds: coords }
  }
  return null
})

ipcMain.handle('perform-ocr', async (_, dataUrl) => {
  const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '')
  const buffer = Buffer.from(base64Data, 'base64')
  const tempPath = join(os.tmpdir(), `ocr_temp_${Date.now()}.png`)

  try {
    await writeFile(tempPath, buffer)
    
    // Path to paddleocr-json executable (assumed to be in resources)
    const ocrPath = app.isPackaged 
      ? join(process.resourcesPath, 'bin/PaddleOCR-json.exe')
      : join(__dirname, '../../resources/bin/PaddleOCR-json.exe')
    return new Promise((resolve, reject) => {
      // PaddleOCR-json requires the image path passed via arguments
      // It outputs log info and JSON result to stdout
      // Try passing image path directly as argument or with --image_path depending on version
      const args = [`--image_path=${tempPath}`]
      console.log('Running OCR with:', ocrPath, args)
      
      // IMPORTANT: Set cwd to the directory of the executable so it can find 'models' folder
      const ocrProcess = spawn(ocrPath, args, {
        cwd: dirname(ocrPath) 
      })
      
      let stdoutData = ''
      let stderrData = ''

      ocrProcess.stdout.on('data', (data) => {
        stdoutData += data.toString()
      })
      
      ocrProcess.stderr.on('data', (data) => {
        stderrData += data.toString()
      })

      ocrProcess.on('close', async (code) => {
        await unlink(tempPath)
        
        console.log('OCR Process exited with code:', code)
        // console.log('OCR Stdout:', stdoutData) 

        // Split output by lines to handle mixed log/json output
        const lines = stdoutData.split(/\r?\n/)
        let result = { text: '', items: [] as any[] }
        let hasJson = false

        for (const line of lines) {
          try {
            if (!line.trim()) continue
            
            // Try to parse each line as JSON
            const parsed = JSON.parse(line.trim())
            
            // Check if it's a valid OCR result (code 100 means success in PaddleOCR-json)
            if (parsed.code === 100 && parsed.data) {
              hasJson = true
              result.text = parsed.data.map((item: any) => item.text).join('\n')
              result.items = parsed.data
              break // Found the result, stop processing
            }
          } catch (e) {
            // Ignore non-JSON lines
          }
        }

        if (hasJson) {
          resolve(result)
        } else {
          // Return detailed error info for debugging
          const debugInfo = [
            '识别失败。调试信息：',
            `Exit Code: ${code}`,
            '--- Stdout ---',
            stdoutData.slice(0, 500) + (stdoutData.length > 500 ? '...' : ''),
            '--- Stderr ---',
            stderrData.slice(0, 500) + (stderrData.length > 500 ? '...' : '')
          ].join('\n')
          resolve({ text: debugInfo, items: [] })
        }
      })

      ocrProcess.on('error', async (err) => {
        if (existsSync(tempPath)) await unlink(tempPath)
        reject(err)
      })
    })
  } catch (error) {
    console.error('OCR Error:', error)
    return { text: 'OCR 识别出错', items: [] }
  }
})

ipcMain.handle('simulate-reply', async (_, { text, focusCoords, sendCoords }) => {
  // Use PowerShell to simulate input
  // focusCoords: {x, y} to click first (to focus window)
  // text: string to type
  // sendCoords: {x, y} to click "Send"
  
  const escapePs = (s: string) => s.replace(/'/g, "''").replace(/"/g, '\\"')
  
  const psScript = `
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    
    $mouse_code = @'
      [DllImport("user32.dll",CharSet=CharSet.Auto, CallingConvention=CallingConvention.StdCall)]
      public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint cButtons, uint dwExtraInfo);
      
      [DllImport("user32.dll")]
      public static extern bool SetCursorPos(int X, int Y);
'@
    $win32 = Add-Type -MemberDefinition $mouse_code -Name "Win32" -Namespace Win32Functions -PassThru

    function Click-At($x, $y) {
       [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point($x, $y)
       $win32::mouse_event(0x0002, 0, 0, 0, 0) # LeftDown
       Start-Sleep -Milliseconds 50
       $win32::mouse_event(0x0004, 0, 0, 0, 0) # LeftUp
    }

    # 1. Click to focus (if coords provided)
    ${focusCoords ? `Click-At ${Math.round(focusCoords.x)} ${Math.round(focusCoords.y)}` : ''}
    
    Start-Sleep -Milliseconds 200

    # 2. Paste text (Clipboard method)
    $text = '${escapePs(text)}'
    try {
        [System.Windows.Forms.Clipboard]::SetText($text)
        Start-Sleep -Milliseconds 100
        [System.Windows.Forms.SendKeys]::SendWait("^v")
    } catch {
        Write-Host "Clipboard paste failed: $_"
    }

    Start-Sleep -Milliseconds 500

    # 3. Click Send (if coords provided)
    ${sendCoords ? `Click-At ${Math.round(sendCoords.x)} ${Math.round(sendCoords.y)}` : ''}
  `

  try {
    // IMPORTANT: Use -Sta for Clipboard access
    const child = spawn('powershell', ['-Sta', '-Command', psScript])
    
    child.stdout.on('data', (d) => console.log('PS stdout:', d.toString()))
    child.stderr.on('data', (d) => console.log('PS stderr:', d.toString()))
    
    return new Promise((resolve) => {
      child.on('close', (code) => {
        resolve({ success: code === 0 })
      })
    })
  } catch (e) {
    console.error('Simulation failed:', e)
    return { success: false, error: e }
  }
})

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
