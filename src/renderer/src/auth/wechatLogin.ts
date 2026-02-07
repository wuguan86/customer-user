import axios from 'axios'

export type WeChatQrCodeResult = {
  url: string
  state: string
}

export type WeChatLoginPollResult = {
  status: string
  token: string | null
  userId: number | null
  tenantId: number | null
}

export async function fetchWeChatQrCode(backendBaseUrl: string, tenantId: string): Promise<WeChatQrCodeResult> {
  const response = await axios.get(`${backendBaseUrl}/api/user/auth/wechat/qrcode`, {
    params: { tenantId: tenantId || '1' }
  })
  return response.data
}

export async function fetchWeChatLoginStatus(backendBaseUrl: string, state: string): Promise<WeChatLoginPollResult> {
  const response = await axios.get(`${backendBaseUrl}/api/user/auth/wechat/status`, { params: { state } })
  return response.data
}

