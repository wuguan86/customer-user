import React from 'react'

const TitleBar = () => {
  const handleMinimize = () => {
    // @ts-ignore
    window.api?.minimizeWindow()
  }

  const handleClose = () => {
    // @ts-ignore
    window.api?.closeWindow()
  }

  return (
    <div className="title-bar">
      <div className="drag-region"></div>
      <div className="window-controls">
        <button className="control-btn" onClick={handleMinimize}>
          <svg width="10" height="1" viewBox="0 0 10 1" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0 0.5H10" stroke="currentColor" strokeWidth="1"/>
          </svg>
        </button>
        <button className="control-btn close-btn" onClick={handleClose}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0.5 0.5L9.5 9.5M9.5 0.5L0.5 9.5" stroke="currentColor" strokeWidth="1"/>
          </svg>
        </button>
      </div>
    </div>
  )
}

export default TitleBar
