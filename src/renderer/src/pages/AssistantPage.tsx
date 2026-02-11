import React, { useEffect, useRef, useState } from 'react'
import axios from 'axios'

type CaptureBounds = { x: number; y: number; w: number; h: number }
type Task = { id: number; name: string; content: string; status: string; type: string }
type ChatMessage = {
  id: string
  contact: string
  content: string
  isSelf: boolean
  timestamp: number
}

const MONITOR_INTERVAL_MIN = 500
const MONITOR_INTERVAL_MAX = 1000
const PIXEL_DIFF_THRESHOLD = 30
const CHANGE_RATIO_THRESHOLD = 0.015
const SAMPLE_STEP = 4

const getNextMonitorDelay = (): number => {
  return Math.floor(MONITOR_INTERVAL_MIN + Math.random() * (MONITOR_INTERVAL_MAX - MONITOR_INTERVAL_MIN))
}

const getItemCenterY = (item: any): number => {
  return (item.box[0][1] + item.box[2][1]) / 2
}

const getItemCenterX = (item: any): number => {
  return (item.box[0][0] + item.box[2][0]) / 2
}

const clamp = (value: number, min: number, max: number): number => {
  if (value < min) return min
  if (value > max) return max
  return value
}

const getItemText = (item: any): string => {
  return (item?.text ?? '').toString()
}

const getItemScore = (item: any): number | null => {
  const score = item?.score ?? item?.confidence ?? item?.probability
  return typeof score === 'number' ? score : null
}

const getItemHeight = (item: any): number => {
  if (!item?.box) return 0
  return Math.abs(item.box[2][1] - item.box[0][1])
}

const getItemWidth = (item: any): number => {
  if (!item?.box) return 0
  return Math.abs(item.box[2][0] - item.box[0][0])
}

const getAverageItemHeight = (items: any[]): number => {
  if (!items || items.length === 0) return 0
  const heights = items.map(getItemHeight).filter((h) => h > 0)
  if (heights.length === 0) return 0
  const sum = heights.reduce((acc, h) => acc + h, 0)
  return sum / heights.length
}

const findSendButtonItem = (items: any[]): any | null => {
  if (!items || items.length === 0) return null
  return items.find((item) => {
    const text = getItemText(item)
    return text.includes('发送') || text.toLowerCase().includes('send')
  }) || null
}

const isNoiseText = (text: string): boolean => {
  const trimmed = text.replace(/\s+/g, '').replace(/\u200B/g, '')
  if (!trimmed) return true
  if (/^[%?·•*#@]+$/.test(trimmed)) return true
  if (trimmed.length === 1 && !/[\u4e00-\u9fff]/.test(trimmed)) return true
  return false
}

const isNoiseItem = (item: any, avgHeight: number): boolean => {
  const text = getItemText(item)
  const trimmed = text.replace(/\s+/g, '').replace(/\u200B/g, '')
  if (!trimmed) return true
  if (/^[%?·•*#@]+$/.test(trimmed)) return true
  const score = getItemScore(item)
  if (score !== null && score < 0.45) return true
  if (trimmed.length === 1) {
    if (!/[\u4e00-\u9fff]/.test(trimmed)) return true
    const height = getItemHeight(item)
    const width = getItemWidth(item)
    if (avgHeight > 0 && (height < avgHeight * 0.6 || width < avgHeight * 0.6)) return true
  }
  return false
}

const getAdaptiveBottomThreshold = (items: any[], height: number): number => {
  if (!items || items.length < 4) return height * 0.88
  const centers = items.map(getItemCenterY).sort((a, b) => a - b)
  const span = centers[centers.length - 1] - centers[0]
  const avgGap = span / Math.max(1, centers.length - 1)
  let maxGap = 0
  let threshold = height * 0.88
  for (let i = 1; i < centers.length; i += 1) {
    const gap = centers[i] - centers[i - 1]
    if (gap > maxGap && centers[i] > height * 0.4) {
      maxGap = gap
      threshold = (centers[i] + centers[i - 1]) / 2
    }
  }
  if (maxGap > Math.max(20, avgGap * 2)) {
    return threshold
  }
  return height * 0.88
}

type Props = {
  backendBaseUrl: string
  tenantId: string
  userToken: string
  onNavigateSettings: () => void
  onLogout?: () => void
}

const getBottomThreshold = (items: any[], height: number): number => {
  const sendBtn = items.find((item) => item.text.includes('发送') || item.text.includes('Send'))
  if (sendBtn) {
    return sendBtn.box[0][1]
  }
  return getAdaptiveBottomThreshold(items, height)
}

const getCleanText = (items: any[], bounds: any, realImageSize?: { w: number; h: number }): string => {
  if (!items || items.length === 0 || !bounds) return ''

  const dpr = window.devicePixelRatio || 1
  const height = realImageSize ? realImageSize.h : bounds.h * dpr
  const bottomThreshold = getBottomThreshold(items, height)
  const avgHeight = getAverageItemHeight(items.filter((item) => {
    const text = getItemText(item)
    return !(text.includes('发送') || text.toLowerCase().includes('send'))
  }))

  const contentItems = items.filter((item) => {
    const text = getItemText(item)
    if (text.includes('发送') || text.includes('Send')) return false

    const itemCenterY = getItemCenterY(item)
    if (itemCenterY > bottomThreshold) {
      return false
    }
    if (isNoiseItem(item, avgHeight)) return false
    return true
  })

  contentItems.sort((a, b) => {
    const centerY_a = (a.box[0][1] + a.box[2][1]) / 2
    const centerY_b = (b.box[0][1] + b.box[2][1]) / 2
    return centerY_a - centerY_b
  })

  return contentItems.map((item) => item.text).join('\n')
}

const normalizeMessage = (text: string): string => {
  return text.replace(/\s+/g, ' ').replace(/\u200B/g, '').trim()
}

const buildAutoSendPayload = (
  reply: string,
  items: any[],
  bounds: CaptureBounds | null,
  imageSize?: { w: number; h: number }
): { text: string; focusCoords?: { x: number; y: number }; sendCoords?: { x: number; y: number } } | null => {
  if (!bounds) return null
  const realSize = imageSize && imageSize.w > 0 && imageSize.h > 0 ? imageSize : { w: bounds.w, h: bounds.h }
  const sendBtn = findSendButtonItem(items)
  let sendCoords: { x: number; y: number } | undefined
  let focusCoords: { x: number; y: number } | undefined

  if (sendBtn) {
    const sendCenterX = getItemCenterX(sendBtn)
    const sendCenterY = getItemCenterY(sendBtn)
    const sendX = bounds.x + (sendCenterX / realSize.w) * bounds.w
    const sendY = bounds.y + (sendCenterY / realSize.h) * bounds.h
    sendCoords = {
      x: clamp(sendX, bounds.x + 5, bounds.x + bounds.w - 5),
      y: clamp(sendY, bounds.y + 5, bounds.y + bounds.h - 5)
    }

    const sendLeft = sendBtn.box[0][0]
    const sendWidth = Math.max(1, sendBtn.box[2][0] - sendBtn.box[0][0])
    const focusXInImage = sendLeft - Math.max(80, sendWidth * 1.6)
    const focusX = bounds.x + (focusXInImage / realSize.w) * bounds.w
    focusCoords = {
      x: clamp(focusX, bounds.x + 10, bounds.x + bounds.w - 10),
      y: clamp(sendY, bounds.y + 5, bounds.y + bounds.h - 5)
    }
  } else {
    focusCoords = {
      x: bounds.x + bounds.w * 0.5,
      y: bounds.y + bounds.h * 0.92
    }
    sendCoords = {
      x: bounds.x + bounds.w * 0.9,
      y: bounds.y + bounds.h * 0.92
    }
  }

  return { text: reply, focusCoords, sendCoords }
}

const getImageDataFromDataUrl = (dataUrl: string): Promise<ImageData | null> => {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(null)
        return
      }
      ctx.drawImage(img, 0, 0)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      resolve(imageData)
    }
    img.onerror = () => resolve(null)
    img.src = dataUrl
  })
}

const hasSignificantChange = (prev: ImageData, current: ImageData): boolean => {
  if (prev.width !== current.width || prev.height !== current.height) return true
  const prevData = prev.data
  const currData = current.data
  const step = Math.max(1, SAMPLE_STEP)
  const stride = 4 * step
  let total = 0
  let changed = 0
  for (let i = 0; i < prevData.length; i += stride) {
    const dr = Math.abs(prevData[i] - currData[i])
    const dg = Math.abs(prevData[i + 1] - currData[i + 1])
    const db = Math.abs(prevData[i + 2] - currData[i + 2])
    total += 1
    if (dr + dg + db > PIXEL_DIFF_THRESHOLD) {
      changed += 1
    }
  }
  if (total === 0) return true
  const ratio = changed / total
  return ratio >= CHANGE_RATIO_THRESHOLD
}

const getLastSpeaker = (items: any[], bounds: any, realImageSize?: { w: number; h: number }): 'ME' | 'THEM' | 'UNKNOWN' => {
  if (!items || items.length === 0 || !bounds) return 'UNKNOWN'

  const dpr = window.devicePixelRatio || 1
  const width = realImageSize ? realImageSize.w : bounds.w * dpr
  const height = realImageSize ? realImageSize.h : bounds.h * dpr
  const bottomThreshold = getBottomThreshold(items, height)
  const avgHeight = getAverageItemHeight(items.filter((item) => {
    const text = getItemText(item)
    return !(text.includes('发送') || text.toLowerCase().includes('send'))
  }))

  const contentItems = items.filter((item) => {
    const text = getItemText(item)
    if (text.includes('发送') || text.includes('Send')) return false

    const itemCenterY = getItemCenterY(item)
    if (itemCenterY > bottomThreshold) {
      return false
    }
    if (isNoiseItem(item, avgHeight)) return false

    return true
  })

  if (contentItems.length === 0) return 'UNKNOWN'

  contentItems.sort((a, b) => getItemCenterY(b) - getItemCenterY(a))

  const lastItem = contentItems[0]
  const centerX = getItemCenterX(lastItem)

  if (centerX > width * 0.55) {
    return 'ME'
  }
  return 'THEM'
}

const getLastMessageFromThem = (items: any[], bounds: any, realImageSize?: { w: number; h: number }): string => {
  if (!items || items.length === 0 || !bounds) return ''

  const dpr = window.devicePixelRatio || 1
  const width = realImageSize ? realImageSize.w : bounds.w * dpr
  const height = realImageSize ? realImageSize.h : bounds.h * dpr
  const bottomThreshold = getBottomThreshold(items, height)
  const avgHeight = getAverageItemHeight(items.filter((item) => {
    const text = getItemText(item)
    return !(text.includes('发送') || text.toLowerCase().includes('send'))
  }))

  const contentItems = items.filter((item) => {
    const text = getItemText(item)
    if (text.includes('发送') || text.includes('Send')) return false

    const itemCenterY = getItemCenterY(item)
    if (itemCenterY > bottomThreshold) {
      return false
    }

    const itemCenterX = getItemCenterX(item)
    if (itemCenterX > width * 0.55) {
      return false
    }
    if (isNoiseItem(item, avgHeight)) return false

    return true
  })

  if (contentItems.length === 0) return ''

  const heights = contentItems.map((item) => Math.abs(item.box[2][1] - item.box[0][1]))
  const avgLineHeight = heights.reduce((sum, v) => sum + v, 0) / heights.length
  const lineGap = Math.max(12, avgLineHeight * 0.9)

  contentItems.sort((a, b) => {
    const centerY_a = (a.box[0][1] + a.box[2][1]) / 2
    const centerY_b = (b.box[0][1] + b.box[2][1]) / 2
    return centerY_a - centerY_b
  })

  const lines: { centerY: number; items: any[] }[] = []
  contentItems.forEach((item) => {
    const centerY = getItemCenterY(item)
    const lastLine = lines[lines.length - 1]
    if (!lastLine || Math.abs(centerY - lastLine.centerY) > lineGap) {
      lines.push({ centerY, items: [item] })
    } else {
      lastLine.items.push(item)
      lastLine.centerY = (lastLine.centerY + centerY) / 2
    }
  })

  let startIndex = lines.length - 1
  while (startIndex > 0) {
    const gap = lines[startIndex].centerY - lines[startIndex - 1].centerY
    if (gap <= lineGap * 1.8) {
      startIndex -= 1
    } else {
      break
    }
  }

  const messageLines = lines.slice(startIndex)
  return messageLines
    .map((line) => {
      line.items.sort((a, b) => {
        const centerX_a = getItemCenterX(a)
        const centerX_b = getItemCenterX(b)
        return centerX_a - centerX_b
      })
      const texts = line.items.map((item) => getItemText(item)).filter((text) => !isNoiseText(text))
      return texts.join('')
    })
    .join('\n')
}

const PlayIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M5 3L19 12L5 21V3Z" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

const LoaderIcon = () => (
  <svg className="icon-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M12 18V22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M4.93 4.93L7.76 7.76" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M16.24 16.24L19.07 19.07" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M2 12H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M18 12H22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M4.93 19.07L7.76 16.24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M16.24 7.76L19.07 4.93" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

function AssistantPage(props: Props): JSX.Element {
  const { backendBaseUrl, tenantId, userToken, onLogout } = props

  const [isRunning, setIsRunning] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [difyResponse, setDifyResponse] = useState<string>('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isSending, setIsSending] = useState(false)
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const [lastReplied, setLastReplied] = useState<{ contact: string; text: string; at: number } | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isRunningRef = useRef(false)
  const activeTaskRef = useRef<Task | null>(null)
  const contactQueueRef = useRef<Map<string, Promise<void>>>(new Map())
  const lastProcessedByContactRef = useRef<Map<string, { text: string; at: number }>>(new Map())

  const getTransitHeaders = () => {
    const headers: Record<string, string> = { 'X-Tenant-Id': tenantId }
    if (userToken) {
      headers['Authorization'] = `Bearer ${userToken}`
    }
    return headers
  }

  const fetchRunningTask = async (): Promise<Task | null> => {
    try {
      const headers = getTransitHeaders()
      const res = await axios.get(`${backendBaseUrl}/api/user/tasks`, { headers })
      const running = (res.data as Task[]).find((task) => task.status === 'RUNNING') || null
      setActiveTask(running)
      return running
    } catch (error) {
      setActiveTask(null)
      return null
    }
  }

  useEffect(() => {
    isRunningRef.current = isRunning
  }, [isRunning])

  useEffect(() => {
    activeTaskRef.current = activeTask
  }, [activeTask])

  useEffect(() => {
    if (backendBaseUrl && userToken) {
      fetchRunningTask()
    } else {
      setActiveTask(null)
    }
  }, [backendBaseUrl, userToken])

  const enqueueIncoming = (msg: any) => {
    const contact = String(msg?.contact || '').trim()
    const text = String(msg?.content || '').trim()
    const isSelf = !!msg?.is_self
    const triggerReply = !!msg?.trigger_reply
    if (!contact || !text) return
    const prev = contactQueueRef.current.get(contact) || Promise.resolve()
    const next = prev
      .then(() => handleIncoming(contact, text, isSelf, triggerReply))
      .catch(() => {
      })
      .finally(() => {
        if (contactQueueRef.current.get(contact) === next) {
          contactQueueRef.current.delete(contact)
        }
      })
    contactQueueRef.current.set(contact, next)
  }

  const handleIncoming = async (contact: string, text: string, isSelf: boolean, triggerReply: boolean) => {
    const normalizedText = normalizeMessage(text)
    if (!normalizedText) return

    const now = Date.now()
    
    // 更新消息列表
    const newMessage: ChatMessage = {
      id: `${contact}-${now}-${Math.random().toString(36).substr(2, 9)}`,
      contact,
      content: normalizedText,
      isSelf,
      timestamp: now
    }
    setMessages((prev) => [...prev, newMessage])
    setTimeout(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
      }
    }, 100)

    // 如果是自己发的消息，则停止处理
    if (isSelf) return

    // 只有当 triggerReply 为 true 时才回复
    if (!triggerReply) {
      console.log('Ignore reply (not latest or already replied):', normalizedText)
      return
    }

    const last = lastProcessedByContactRef.current.get(contact)
    if (last && last.text === normalizedText && now - last.at < 120000) {
      return
    }
    if (last && now - last.at < 8000) {
      return
    }
    lastProcessedByContactRef.current.set(contact, { text: normalizedText, at: now })

    setIsSending(true)
    setDifyResponse('正在思考...')

    try {
      const task = activeTaskRef.current
      if (!task?.id) {
        setDifyResponse('请先在任务设置中开启一个任务')
        return
      }
      const headers = getTransitHeaders()
      const res = await axios.post(
        `${backendBaseUrl}/api/user/dify/monitor-chat`,
        {
          taskId: task.id,
          message: normalizedText,
          role: task.content || '',
          wechatContact: contact
        },
        { headers }
      )
      const reply = res.data.answer
      setDifyResponse(reply)
      if (reply) {
        const api = (window as any).api
        const sendRes = await api.sendWeChatMessage({ target: contact, content: reply })
        if (!sendRes?.ok || sendRes?.success === false) {
          setDifyResponse(reply + '\n\n(自动发送失败)')
        } else {
          setLastReplied({ contact, text: reply, at: Date.now() })
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

  useEffect(() => {
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current)
      pollTimeoutRef.current = null
    }
    if (!isRunning) {
      return
    }

    const loop = async () => {
      if (!isRunningRef.current) return
      try {
        const api = (window as any).api
        const res = await api.pollWeChatMessages()
        if (res?.ok && Array.isArray(res.messages)) {
          for (const msg of res.messages) {
            if (msg?.type === 'text' && msg?.content) {
              enqueueIncoming(msg)
            }
          }
        }
      } catch (e: any) {
        setDifyResponse('轮询失败: ' + (e?.message || String(e)))
      } finally {
        if (isRunningRef.current) {
          const delay = 600 + Math.floor(Math.random() * 600)
          pollTimeoutRef.current = setTimeout(loop, delay)
        }
      }
    }

    pollTimeoutRef.current = setTimeout(loop, 200)
    return () => {
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current)
      }
    }
  }, [isRunning])

  const toggleRunning = async () => {
    const api = (window as any).api
    if (!api?.startWeChatBridge) {
      alert('无法调用微信桥接：Electron API 未找到')
      return
    }
    if (isRunningRef.current) {
      setIsRunning(false)
      try {
        await api.stopWeChatBridge()
      } catch (e) {
      }
      return
    }
    
    setIsConnecting(true)
    setDifyResponse('')

    try {
      const runningTask = await fetchRunningTask()
      if (!runningTask?.id) {
        setDifyResponse('请先在任务设置中开启一个任务')
        return
      }
      await api.startWeChatBridge()
      setIsRunning(true)
    } catch (e) {
      console.error(e)
    } finally {
      setIsConnecting(false)
    }
  }

  let btnClass = 'btn-start-action'
  let btnContent: React.ReactNode = null
  
  if (isConnecting) {
    btnClass += ' starting'
    btnContent = (
      <>
        <LoaderIcon />
        <span>连接中...</span>
      </>
    )
  } else if (isRunning) {
    btnClass += ' running'
    btnContent = (
      <>
        <div className="icon-breathing" />
        <span>停止运行</span>
      </>
    )
  } else {
    btnClass += ' ready'
    btnContent = (
      <>
        <PlayIcon />
        <span>启动运行</span>
      </>
    )
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-title-group">
          <h4 className="page-title">AI 运营助手</h4>
          <div className={`status-badge ${isRunning ? 'active' : ''}`}>
            <div className="status-indicator"></div>
            {isRunning ? '运行中' : '就绪'}
          </div>
        </div>
        
        <div className="page-header-actions">
          <button className={btnClass} onClick={toggleRunning} disabled={isSending || isConnecting}>
            {btnContent}
          </button>
        </div>
      </header>

      <div className="page-body">
        <div className="assistant-container">
          <div className="card card-content-stack">
            <div>
              <h5 className="section-title">📝 微信消息</h5>
              <div className="chat-history-container">
                {messages.length === 0 && (
                  <div style={{ color: '#999', textAlign: 'center', marginTop: '150px' }}>
                    启动后，收到的微信消息会出现在这里...
                  </div>
                )}
                {messages.map((msg, index) => {
                  const isLatest = index === messages.length - 1
                  return (
                    <div
                      key={msg.id}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: msg.isSelf ? 'flex-end' : 'flex-start',
                        marginBottom: '15px'
                      }}
                    >
                      <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px', display: 'flex', alignItems: 'center' }}>
                        {!msg.isSelf && isLatest && (
                          <span style={{ 
                            background: '#ff4d4f', color: 'white', fontSize: '10px', 
                            padding: '1px 4px', borderRadius: '4px', marginRight: '6px' 
                          }}>
                            NEW
                          </span>
                        )}
                        <span>{msg.isSelf ? '我' : msg.contact}</span>
                        <span style={{ marginLeft: '8px' }}>{new Date(msg.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <div
                        style={{
                          background: msg.isSelf ? '#95ec69' : '#ffffff',
                          color: '#333',
                          padding: '10px 14px',
                          borderRadius: '8px',
                          maxWidth: '85%',
                          wordBreak: 'break-word',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                          lineHeight: '1.5',
                          fontSize: '14px',
                          border: msg.isSelf ? 'none' : '1px solid #e8e8e8'
                        }}
                      >
                        {msg.content}
                      </div>
                    </div>
                  )
                })}
                <div ref={messagesEndRef} />
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

            {lastReplied && (
              <div className="card-divider">
                <h5 className="section-title">📤 已回复</h5>
                <div className="ai-response-box">
                  {`${lastReplied.contact}\n${new Date(lastReplied.at).toLocaleTimeString()}\n\n${lastReplied.text}`}
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
