import React, { useEffect, useRef, useState } from 'react'
import axios from 'axios'

type CaptureBounds = { x: number; y: number; w: number; h: number }

type Props = {
  backendBaseUrl: string
  tenantId: string
  userToken: string
  onNavigateSettings: () => void
  onLogout?: () => void
}

const getCleanText = (items: any[], bounds: any): string => {
  if (!items || items.length === 0 || !bounds) return ''

  const dpr = window.devicePixelRatio || 1
  const height = bounds.h * dpr

  const contentItems = items.filter((item) => {
    const text = item.text
    if (text.includes('发送') || text.includes('Send')) return false

    const itemCenterY = (item.box[0][1] + item.box[2][1]) / 2
    if (itemCenterY > height * 0.85) {
      return false
    }
    return true
  })

  contentItems.sort((a, b) => {
    const centerY_a = (a.box[0][1] + a.box[2][1]) / 2
    const centerY_b = (b.box[0][1] + b.box[2][1]) / 2
    return centerY_a - centerY_b
  })

  return contentItems.map((item) => item.text).join('\n')
}

const getLastSpeaker = (items: any[], bounds: any): 'ME' | 'THEM' | 'UNKNOWN' => {
  if (!items || items.length === 0 || !bounds) return 'UNKNOWN'

  const dpr = window.devicePixelRatio || 1
  const width = bounds.w * dpr
  const height = bounds.h * dpr

  const contentItems = items.filter((item) => {
    const text = item.text
    if (text.includes('发送') || text.includes('Send')) return false

    const itemCenterY = (item.box[0][1] + item.box[2][1]) / 2
    if (itemCenterY > height * 0.85) {
      return false
    }

    return true
  })

  if (contentItems.length === 0) return 'UNKNOWN'

  contentItems.sort((a, b) => {
    const centerY_a = (a.box[0][1] + a.box[2][1]) / 2
    const centerY_b = (b.box[0][1] + b.box[2][1]) / 2
    return centerY_b - centerY_a
  })

  const lastItem = contentItems[0]
  const centerX = (lastItem.box[0][0] + lastItem.box[2][0]) / 2

  if (centerX > width * 0.55) {
    return 'ME'
  }
  return 'THEM'
}

function AssistantPage(props: Props): JSX.Element {
  const { backendBaseUrl, tenantId, userToken, onNavigateSettings } = props

  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [ocrResult, setOcrResult] = useState<string>('')
  const [ocrItems, setOcrItems] = useState<any[]>([])
  const [captureBounds, setCaptureBounds] = useState<CaptureBounds | null>(null)

  const [isMonitoring, setIsMonitoring] = useState(false)
  const [difyResponse, setDifyResponse] = useState<string>('')
  const [isSending, setIsSending] = useState(false)
  const [conversationId, setConversationId] = useState<string>('')

  const lastProcessedTextRef = useRef<string>('')
  const monitoringTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const getTransitHeaders = () => {
    const headers: Record<string, string> = { 'X-Tenant-Id': tenantId }
    if (userToken) {
      headers['Authorization'] = `Bearer ${userToken}`
    }
    return headers
  }

  useEffect(() => {
    if (monitoringTimeoutRef.current) {
      clearTimeout(monitoringTimeoutRef.current)
      monitoringTimeoutRef.current = null
    }

    if (isMonitoring) {
      const monitorLoop = () => {
        monitoringTimeoutRef.current = setTimeout(() => {
          const api = (window as any).api
          if (api) {
            console.log('Auto capturing...')
            api.startCapture()
          }
        }, 3000)
      }
      monitorLoop()
    }

    return () => {
      if (monitoringTimeoutRef.current) {
        clearTimeout(monitoringTimeoutRef.current)
      }
    }
  }, [isMonitoring])

  const toggleMonitoring = () => {
    setIsMonitoring(!isMonitoring)
  }

  const sendToDifyWithText = async (text: string, items: any[], bounds: any) => {
    if (!text || !text.trim()) return

    if (isMonitoring && text === lastProcessedTextRef.current) {
      console.log('Skipping duplicate text in monitoring mode')
      return
    }

    lastProcessedTextRef.current = text
    setIsSending(true)
    setDifyResponse('正在思考...')

    try {
      const headers = getTransitHeaders()
      const res = await axios.post(
        `${backendBaseUrl}/api/dify/chat-messages`,
        {
          query: text,
          inputs: {},
          conversation_id: conversationId || undefined,
          user: 'electron-user'
        },
        { headers }
      )

      const reply = res.data.answer
      const newConvId = res.data.conversation_id
      if (newConvId) setConversationId(newConvId)

      setDifyResponse(reply)

      if (isMonitoring && reply) {
        const lastSpeaker = getLastSpeaker(items, bounds)
        if (lastSpeaker === 'ME') {
          console.log('Last speaker is ME, skipping auto-reply')
          return
        }

        const dpr = window.devicePixelRatio || 1
        let sendCoords = null
        let focusCoords = null

        const sendBtn = items.find(
          (i) => i.text.includes('发送') || i.text.includes('Send') || i.text.includes('Enter')
        )
        if (sendBtn) {
          sendCoords = {
            x: (sendBtn.box[0][0] + sendBtn.box[2][0]) / 2 * dpr,
            y: (sendBtn.box[0][1] + sendBtn.box[2][1]) / 2 * dpr
          }
          focusCoords = {
            x: sendCoords.x - 20,
            y: sendCoords.y - 60
          }
        }

        if (!focusCoords) {
          focusCoords = {
            x: (bounds.x + bounds.w / 2) * dpr,
            y: (bounds.y + bounds.h / 2) * dpr
          }
        }

        const api = (window as any).api
        if (api && api.simulateReply) {
          await api.simulateReply({
            text: reply,
            focusCoords,
            sendCoords
          })
          setDifyResponse(reply + '\n(回复已发送)')
        }
      }
    } catch (err: any) {
      if (err.response?.status === 401 && onLogout) {
        onLogout()
        return
      }
      setDifyResponse('发送失败: ' + (err.response?.data?.message || err.message))
    } finally {
      setIsSending(false)
    }
  }

  const sendToDify = async () => {
    await sendToDifyWithText(ocrResult, ocrItems, captureBounds)
  }

  useEffect(() => {
    const api = (window as any).api
    if (!api) {
      return
    }

    const handler = async (data: any) => {
      const { dataUrl, bounds } = typeof data === 'string' ? { dataUrl: data, bounds: null } : data
      setCapturedImage(dataUrl)
      setCaptureBounds(bounds)
      setOcrResult('正在识别文字...')
      setDifyResponse('')

      try {
        const ocrData = await api.performOcr(dataUrl)
        const rawText = typeof ocrData === 'string' ? ocrData : ocrData.text
        const items = typeof ocrData === 'string' ? [] : ocrData.items

        const cleanText = getCleanText(items, bounds) || rawText

        setOcrResult(cleanText)
        setOcrItems(items)

        if (cleanText && !cleanText.includes('识别失败')) {
          await sendToDifyWithText(cleanText, items, bounds)
        } else if (cleanText.includes('识别失败')) {
          setDifyResponse('OCR 识别失败，无法发送给 Dify')
        }
      } catch (err) {
        setOcrResult('识别失败: ' + err)
        setDifyResponse('处理流程出错: ' + err)
      }
    }

    api.onCaptureImage(handler)
  }, [userToken, tenantId, backendBaseUrl])

  const handleStartCapture = () => {
    const api = (window as any).api
    if (api) {
      api.startCapture()
    } else {
      alert('无法调用截图功能：Electron API 未找到')
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-title-group">
          <h4 className="page-title">AI 运营助手</h4>
          <div className={`status-badge ${isMonitoring ? 'active' : ''}`}>
            <div className="status-indicator"></div>
            {isMonitoring ? '监控运行中' : '就绪'}
          </div>
        </div>
        
        <div className="page-header-actions">
          <div 
            className={`switch-container ${isMonitoring ? 'active' : ''}`} 
            onClick={toggleMonitoring}
            title="自动监控开关"
          >
            <span className="switch-label">{isMonitoring ? '自动监控' : '自动监控'}</span>
            <div className={`switch-track ${isMonitoring ? 'active' : ''}`}>
              <div className="switch-handle"></div>
            </div>
          </div>

          <button className="btn-core-gradient" onClick={handleStartCapture}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12V7c0-2.8-2.2-5-5-5H8C5.2 2 3 4.2 3 7v10c0 2.8 2.2 5 5 5h5" />
              <path d="M19 19m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" />
              <path d="M19 16v3" />
              <path d="M19 22v-3" />
              <path d="M22 19h-3" />
              <path d="M16 19h3" />
            </svg>
            {captureBounds ? '重新框选' : '开始截图识别'}
          </button>
        </div>
      </header>

      <div className="page-body">
        <div className="assistant-container">
          {capturedImage && (
            <div className="card">
              <h5 className="section-title">📷 截图预览</h5>
              <img
                src={capturedImage}
                alt="Captured"
                className="preview-image"
              />
            </div>
          )}

          <div className="card card-content-stack">
            <div>
              <h5 className="section-title">📝 识别文字</h5>
              <div className="textarea-wrapper">
                <textarea
                  value={ocrResult}
                  onChange={(e) => setOcrResult(e.target.value)}
                  placeholder="截图后的文字会出现在这里..."
                />
              </div>
            </div>

            {difyResponse && (
              <div className="card-divider">
                <h5 className="section-title">🤖 AI 建议</h5>
                <div className="ai-response-box">
                  {difyResponse}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default AssistantPage
