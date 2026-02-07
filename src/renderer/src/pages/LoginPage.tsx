import React, { useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { fetchWeChatLoginStatus, fetchWeChatQrCode } from '../auth/wechatLogin'
import TitleBar from '../components/TitleBar'

type Props = {
  backendBaseUrl: string
  tenantId: string
  onLoginSuccess: (auth: { token: string; tenantId: string; userId: number }) => void
}

function LoginPage(props: Props): JSX.Element {
  const { backendBaseUrl, tenantId, onLoginSuccess } = props

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const [loginState, setLoginState] = useState<string>('')
  const [statusText, setStatusText] = useState<string>('')
  const [isLoadingQr, setIsLoadingQr] = useState(false)
  const [errorText, setErrorText] = useState('')
  const pollTimerRef = useRef<number | null>(null)

  const [isAgreed, setIsAgreed] = useState(false)

  const subtitle = useMemo(() => {
    return '让客户运营从辅助驾驶到自动驾驶'
  }, [])

  const stopPolling = () => {
    if (pollTimerRef.current) {
      window.clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }

  const closeModal = () => {
    stopPolling()
    setIsModalOpen(false)
  }

  const startPolling = (state: string) => {
    stopPolling()
    pollTimerRef.current = window.setInterval(async () => {
      try {
        const res = await fetchWeChatLoginStatus(backendBaseUrl.trim(), state)
        const status = (res.status || '').toUpperCase()

        if (status === 'COMPLETED' && res.token) {
          stopPolling()
          onLoginSuccess({
            token: res.token,
            tenantId: String(res.tenantId ?? tenantId ?? '1'),
            userId: Number(res.userId ?? 0)
          })
          setStatusText('登录成功，正在进入...')
          setTimeout(() => closeModal(), 200)
          return
        }

        if (status === 'EXPIRED' || status === 'INVALID') {
          stopPolling()
          setStatusText('二维码已过期，请刷新二维码')
          return
        }

        if (status === 'FAILED') {
          stopPolling()
          setStatusText('登录失败，请刷新二维码重试')
          return
        }

        if (status === 'PROCESSING') {
          setStatusText('已扫码，等待确认...')
          return
        }

        setStatusText('请使用微信扫码登录')
      } catch (e: any) {
        stopPolling()
        setStatusText('轮询失败，请检查后端地址或网络')
      }
    }, 1500)
  }

  const refreshQrCode = async () => {
    setErrorText('')
    setStatusText('')
    setIsLoadingQr(true)
    stopPolling()
    try {
      const qr = await fetchWeChatQrCode(backendBaseUrl.trim(), tenantId.trim() || '1')
      const dataUrl = await QRCode.toDataURL(qr.url, {
        width: 260,
        margin: 1,
        errorCorrectionLevel: 'M',
        color: { dark: '#0B1F1A', light: '#FFFFFF' }
      })
      setQrDataUrl(dataUrl)
      setLoginState(qr.state)
      setStatusText('请使用微信扫码登录')
      startPolling(qr.state)
    } catch (e: any) {
      setErrorText(e?.response?.data?.message || e?.message || '获取二维码失败')
    } finally {
      setIsLoadingQr(false)
    }
  }

  const handleWeChatLogin = async () => {
    // TEMP: 临时开发直接跳过登录
    onLoginSuccess({
      token: 'dev-token',
      tenantId: tenantId || '1',
      userId: 1
    })
    return

    // const url = backendBaseUrl.trim()
    // if (!url) {
    //   setErrorText('后端地址配置错误，请联系管理员')
    //   return
    // }
    // setIsModalOpen(true)
    // await refreshQrCode()
  }

  useEffect(() => {
    return () => stopPolling()
  }, [])

  return (
    <div className="login-page">
      <TitleBar />
      <div className="login-surface">
        <div className="login-brand">
          <div className="login-logo">
            <div className="login-logo-mark">视界</div>
          </div>
          <div className="login-subtitle">{subtitle}</div>
        </div>

        <div className="login-actions">
          <button className="login-wechat-btn" type="button" onClick={handleWeChatLogin}>
            微信登录
          </button>
          
          <div className="login-compliance">
            <input 
              type="checkbox" 
              id="compliance-check" 
              className="compliance-checkbox"
              checked={isAgreed} 
              onChange={(e) => setIsAgreed(e.target.checked)}
            />
            <label htmlFor="compliance-check">
              登录即代表同意<span className="protocol-link">服务协议</span>和<span className="protocol-link">隐私政策</span>
            </label>
          </div>

          <div className="login-hint">扫码登录后自动进入主界面</div>
          {errorText && <div className="login-hint" style={{ color: '#ff4d4f' }}>{errorText}</div>}
        </div>
      </div>

      {isModalOpen && (
        <div className="wechat-modal-mask" role="dialog" aria-modal="true">
          <div className="wechat-modal">
            <div className="wechat-modal-header">
              <div className="wechat-modal-title">微信扫码登录</div>
              <button className="wechat-modal-close" type="button" onClick={closeModal}>
                ×
              </button>
            </div>

            <div className="wechat-modal-body">
              <div className="wechat-qr">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="wechat-qrcode" style={{ width: 260, height: 260, borderRadius: 12 }} />
                ) : (
                  <div className="wechat-qr-placeholder">{isLoadingQr ? '加载中...' : '暂无二维码'}</div>
                )}
              </div>
              <div className="wechat-status">{statusText || '准备中...'}</div>

              <div className="wechat-actions">
                <button className="btn-ghost-purple" type="button" onClick={refreshQrCode} disabled={isLoadingQr}>
                  {isLoadingQr ? '刷新中...' : '刷新二维码'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default LoginPage
