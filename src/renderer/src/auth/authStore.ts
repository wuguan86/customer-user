export type AuthSnapshot = {
  token: string
  tenantId: string
}

const TOKEN_KEY = 'userToken'
const TENANT_KEY = 'tenantId'

export function readAuthSnapshot(): AuthSnapshot {
  return {
    token: localStorage.getItem(TOKEN_KEY) || '',
    tenantId: localStorage.getItem(TENANT_KEY) || '1'
  }
}

export function writeAuthSnapshot(snapshot: AuthSnapshot): void {
  localStorage.setItem(TOKEN_KEY, snapshot.token || '')
  localStorage.setItem(TENANT_KEY, snapshot.tenantId || '1')
}

export function clearAuthSnapshot(): void {
  localStorage.removeItem(TOKEN_KEY)
}
