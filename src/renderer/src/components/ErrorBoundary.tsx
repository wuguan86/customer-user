import React, { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo)
    this.setState({ errorInfo })
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ 
          padding: '20px', 
          fontFamily: 'sans-serif', 
          height: '100vh', 
          display: 'flex', 
          flexDirection: 'column', 
          justifyContent: 'center', 
          alignItems: 'center',
          backgroundColor: '#f5f5f5',
          color: '#333'
        }}>
          <h1 style={{ color: '#ff4d4f' }}>出错了 / Something went wrong</h1>
          <div style={{ 
            maxWidth: '800px', 
            width: '100%', 
            backgroundColor: 'white', 
            padding: '20px', 
            borderRadius: '8px', 
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            overflow: 'auto',
            maxHeight: '80vh'
          }}>
            <h3 style={{ marginTop: 0 }}>Error: {this.state.error?.toString()}</h3>
            <details style={{ whiteSpace: 'pre-wrap', cursor: 'pointer' }}>
              <summary style={{ marginBottom: '10px', color: '#1890ff' }}>View Component Stack</summary>
              {this.state.errorInfo?.componentStack}
            </details>
            <div style={{ marginTop: '20px', textAlign: 'center' }}>
              <button 
                onClick={() => window.location.reload()}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#1890ff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Reload App
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
