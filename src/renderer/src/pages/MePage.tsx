import React, { useEffect, useState } from 'react'
import axios from 'axios'

type Props = {
  backendBaseUrl: string
  tenantId: string
  userToken: string
  onLogout: () => void
}

type MeResponse = {
  id: number
  tenantId: number
  nickname: string
  avatarUrl: string
}

type MembershipPlan = {
  id: number
  planCode: string
  type: 'SUBSCRIPTION' | 'POINTS'
  name: string
  priceCents: number
  durationDays: number
  description: string
  featuresJson: string
}

type MonthlyPlanUI = {
  title: string
  price: string
  period: string
  features: string[]
  highlight: boolean
  isCustom?: boolean
  customTitle?: string
}

type PointPlanUI = {
  title: string
  price: string
  description: string
  highlight: boolean
}

function MePage(props: Props): JSX.Element {
  const { backendBaseUrl, tenantId, userToken, onLogout } = props

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [me, setMe] = useState<MeResponse | null>(null)
  const [activeTab, setActiveTab] = useState<'monthly' | 'points'>('monthly')
  const [monthlyPlans, setMonthlyPlans] = useState<MonthlyPlanUI[]>([])
  const [pointPlans, setPointPlans] = useState<PointPlanUI[]>([])

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      setError('')
      try {
        // Handle headers: Authorization is optional if no userToken
        const headers: Record<string, string> = { 'X-Tenant-Id': tenantId }
        if (userToken) {
          headers['Authorization'] = `Bearer ${userToken}`
        }
        
        // Fetch User Me (only if logged in)
        if (userToken) {
          try {
            const meRes = await axios.get(`${backendBaseUrl}/api/user/me`, { headers })
            setMe(meRes.data)
          } catch (meError: any) {
            console.error('Failed to fetch user profile', meError)
            if (meError.response?.status === 401) {
              // Token expired or invalid
              setMe(null)
              // We don't force logout here, just treat as guest
            }
          }
        } else {
          setMe(null)
        }

        // Fetch Plans (Public endpoint)
        try {
            const plansRes = await axios.get<MembershipPlan[]>(`${backendBaseUrl}/api/user/membership/plans`, { headers })
            const plans = plansRes.data
            
            // Process Monthly Plans
            const monthly = plans
            .filter(p => p.type === 'SUBSCRIPTION')
            .map(p => {
                const isCustom = p.priceCents === 0
                let features: string[] = []
                try {
                  const parsed = JSON.parse(p.featuresJson || '[]')
                  if (Array.isArray(parsed)) {
                    features = parsed
                  } else if (typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as any).highlights)) {
                    features = (parsed as any).highlights
                  } else {
                    console.warn('featuresJson is not an array:', parsed)
                    features = []
                  }
                } catch (e) {
                console.error('Failed to parse featuresJson', e)
                }

                return {
                title: p.name,
                price: isCustom ? '' : `${p.priceCents / 100}元`,
                period: p.description || `${p.durationDays}天`,
                features: features,
                highlight: false,
                isCustom: isCustom,
                customTitle: isCustom ? p.description : undefined
                }
            })
            setMonthlyPlans(monthly)

            // Process Point Plans
            const points = plans
            .filter(p => p.type === 'POINTS')
            .map(p => ({
                title: p.name,
                price: `${p.priceCents / 100}元`,
                description: p.description,
                highlight: false
            }))
            setPointPlans(points)
        } catch (planError: any) {
            console.error('Failed to fetch plans', planError)
             // If plans fetch fails (e.g. network), we might want to show error
             // But if it's 401 (shouldn't be now), we handle it
        }

      } catch (e: any) {
        console.error('Fetch error:', e)
        setError(e.response?.data?.message || e.message || '加载失败')
      } finally {
        setLoading(false)
      }
    }
    if (backendBaseUrl && tenantId) {
      fetchData()
    }
  }, [backendBaseUrl, tenantId, userToken])

  return (
    <div className="me-page">
      <div className="me-container">
        {/* Top Section: Dashboard Grid */}
        <div className="dashboard-grid">
          {/* User Profile Card */}
          <div className="dashboard-card user-card">
            <div className="user-content">
              <div className="avatar-group">
                <div className="avatar-wrapper">
                  {me?.avatarUrl ? (
                    <img src={me.avatarUrl} alt="avatar" />
                  ) : (
                    <div className="avatar-placeholder">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                    </div>
                  )}
                </div>
                <div className="user-details">
                  <div className="user-name-row">
                    <h2 className="user-name">{me?.nickname || '未登录'}</h2>
                    <span className="user-badge">{me ? '免费版' : '访客'}</span>
                  </div>
                  <p className="user-id">ID: {me?.id || '-'}</p>
                </div>
              </div>
              <button 
                className="logout-btn-icon" 
                onClick={onLogout} 
                title={me ? "退出登录" : "点击登录"}
              >
                {me ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
                )}
              </button>
            </div>
            <div className="card-decoration"></div>
          </div>

          {/* Credits Card */}
          <div className="dashboard-card credits-card">
            <div className="credits-content">
              <div className="credits-info">
                <span className="credits-label">剩余积分</span>
                <div className="credits-value-row">
                  <span className="credits-value">0</span>
                  <span className="credits-total">/ 0</span>
                </div>
                <div className="credits-subtext">订阅赠送 0 · 加油包 0</div>
              </div>
              <div className="credits-chart">
                <div className="circular-progress">
                  <svg viewBox="0 0 36 36" className="circular-chart">
                    <path className="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                    <path className="circle" strokeDasharray="0, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  </svg>
                  <div className="percentage">0%</div>
                </div>
              </div>
            </div>
            <button className="redeem-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20"></path><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
              兑换积分
            </button>
          </div>
        </div>

        {/* Pricing Section */}
        <div className="pricing-section">
          <div className="section-header">
            <h3 className="section-title">订阅计划</h3>
            <div className="pricing-tabs">
              <button 
                className={`tab-btn ${activeTab === 'monthly' ? 'active' : ''}`}
                onClick={() => setActiveTab('monthly')}
              >
                会员月包
              </button>
              <button 
                className={`tab-btn ${activeTab === 'points' ? 'active' : ''}`}
                onClick={() => setActiveTab('points')}
              >
                积分加油包
              </button>
            </div>
          </div>

          <div className="pricing-cards">
            {loading && <div className="loading-state">加载中...</div>}
            {error && <div className="error-message">加载失败: {error}</div>}
            {!loading && !error && activeTab === 'monthly' && monthlyPlans.length === 0 && (
              <div className="empty-state">暂无订阅套餐</div>
            )}
            {!loading && !error && activeTab === 'points' && pointPlans.length === 0 && (
              <div className="empty-state">暂无积分套餐</div>
            )}

            {!loading && !error && (
              activeTab === 'monthly' ? (
                monthlyPlans.map((plan, index) => (
                  <div key={index} className="pricing-card">
                    <div className="card-glow"></div>
                    <div className="card-header">
                      <h3>{plan.title}</h3>
                      {plan.isCustom ? (
                        <div className="custom-price">{plan.customTitle}</div>
                      ) : (
                        <div className="price-row">
                          <div className="price">{plan.price}</div>
                          <div className="period">{plan.period}</div>
                        </div>
                      )}
                    </div>
                    <ul className="features-list">
                      {plan.features.map((feature, i) => (
                        <li key={i}>
                          <svg className="check-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                          {feature}
                        </li>
                      ))}
                    </ul>
                    <button className="buy-btn">
                      {plan.isCustom ? '联系顾问' : '立即开通'}
                    </button>
                  </div>
                ))
              ) : (
                pointPlans.map((plan, index) => (
                  <div key={index} className="pricing-card points-card">
                    <div className="card-glow"></div>
                    <div className="card-header">
                      <h3>{plan.title}</h3>
                      <div className="price">{plan.price}</div>
                    </div>
                    <div className="plan-description">
                      <svg className="check-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                      {plan.description}
                    </div>
                    <div className="spacer" style={{ flex: 1 }}></div>
                    <button className="buy-btn">立即充值</button>
                  </div>
                ))
              )
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default MePage
