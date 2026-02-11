import React, { useState, useEffect } from 'react'
import axios from 'axios'

type Props = {
  backendBaseUrl: string
  tenantId: string
  userToken: string
  setUserToken: (token: string) => void
}

interface Task {
  id: number
  name: string
  content: string
  status: string
  type: string
  userId: number
  promptTemplateId?: number
  knowledgeBaseId?: string
}

interface PromptTemplate {
  id: number
  name: string
  content: string
}

export default function SettingsPage(props: Props): JSX.Element {
  const { backendBaseUrl, tenantId, userToken } = props

  const [view, setView] = useState<'list' | 'form'>('list')
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)

  const [formData, setFormData] = useState<Partial<Task>>({
    name: '',
    content: '',
    type: '长期任务',
    status: 'PENDING',
    knowledgeBaseId: ''
  })

  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false)
  const [templates, setTemplates] = useState<PromptTemplate[]>([])
  const [isKnowledgeModalOpen, setIsKnowledgeModalOpen] = useState(false)
  const [isUploadPanelOpen, setIsUploadPanelOpen] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [boundKnowledgeBaseId, setBoundKnowledgeBaseId] = useState('')

  const getHeaders = () => {
    const headers: Record<string, string> = { 'X-Tenant-Id': tenantId }
    if (userToken) {
      headers['Authorization'] = `Bearer ${userToken}`
    }
    return headers
  }

  const fetchTasks = async () => {
    setLoading(true)
    try {
      const res = await axios.get(`${backendBaseUrl}/api/user/tasks`, { headers: getHeaders() })
      setTasks(res.data)
    } catch (error) {
      console.error('Failed to fetch tasks', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchTemplates = async () => {
    try {
      const res = await axios.get(`${backendBaseUrl}/api/user/prompt-templates`, { headers: getHeaders() })
      setTemplates(res.data)
    } catch (error) {
      console.error('Failed to fetch templates', error)
    }
  }


  useEffect(() => {
    if (backendBaseUrl && userToken) {
      fetchTasks()
    }
  }, [backendBaseUrl, userToken])

  const handleEdit = (task: Task) => {
    setEditingTask(task)
    setFormData({
      name: task.name,
      content: task.content,
      type: task.type,
      status: task.status,
      knowledgeBaseId: task.knowledgeBaseId
    })
    setBoundKnowledgeBaseId(task.knowledgeBaseId || '')
    setView('form')
  }

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这个任务吗？')) return
    try {
      await axios.delete(`${backendBaseUrl}/api/user/tasks/${id}`, { headers: getHeaders() })
      fetchTasks()
    } catch (error) {
      console.error('Failed to delete task', error)
      alert('删除失败')
    }
  }

  const handleToggleStatus = async (task: Task) => {
    const newStatus = task.status === 'RUNNING' ? 'PENDING' : 'RUNNING'
    try {
      if (newStatus === 'RUNNING') {
        const runningTasks = tasks.filter(item => item.status === 'RUNNING' && item.id !== task.id)
        if (runningTasks.length > 0) {
          await Promise.all(
            runningTasks.map(item =>
              axios.put(`${backendBaseUrl}/api/user/tasks/${item.id}`, {
                ...item,
                status: 'PENDING'
              }, { headers: getHeaders() })
            )
          )
        }
      }
      await axios.put(`${backendBaseUrl}/api/user/tasks/${task.id}`, {
        ...task,
        status: newStatus
      }, { headers: getHeaders() })
      fetchTasks()
    } catch (error) {
      console.error('Failed to toggle status', error)
    }
  }

  const saveTask = async (returnToList: boolean) => {
    if (!formData.name) {
      alert('请输入任务名称')
      return null
    }
    if (formData.name.length > 15) {
      alert('任务名称不能超过 15 个字符')
      return null
    }
    try {
      const res = editingTask
        ? await axios.put(`${backendBaseUrl}/api/user/tasks/${editingTask.id}`, formData, { headers: getHeaders() })
        : await axios.post(`${backendBaseUrl}/api/user/tasks`, formData, { headers: getHeaders() })
      const savedTask = res.data as Task
      setEditingTask(savedTask)
      setFormData({
        name: savedTask.name,
        content: savedTask.content,
        type: savedTask.type,
        status: savedTask.status,
        knowledgeBaseId: savedTask.knowledgeBaseId
      })
      setBoundKnowledgeBaseId(savedTask.knowledgeBaseId || '')
      if (returnToList) {
        setView('list')
      }
      fetchTasks()
      return savedTask
    } catch (error) {
      console.error('Failed to save task', error)
      alert('保存失败')
      return null
    }
  }

  const handleSave = async () => {
    await saveTask(true)
  }

  const handleApplyTemplate = (template: PromptTemplate) => {
    setFormData(prev => ({
      ...prev,
      content: template.content
    }))
    setIsTemplateModalOpen(false)
  }

  const openTemplateModal = () => {
    fetchTemplates()
    setIsTemplateModalOpen(true)
  }

  const openKnowledgeModal = async () => {
    let task = editingTask
    if (!task?.id) {
      task = await saveTask(false)
      if (!task) {
        return
      }
    }
    setUploadStatus('')
    setIsUploadPanelOpen(false)
    setIsKnowledgeModalOpen(true)
  }

  const closeKnowledgeModal = () => {
    setIsKnowledgeModalOpen(false)
    setIsUploadPanelOpen(false)
    setIsDragging(false)
  }

  const appendFiles = (fileList: FileList | null) => {
    if (!fileList) return
    const incoming = Array.from(fileList)
    setSelectedFiles(prev => {
      const seen = new Map(prev.map(file => [`${file.name}-${file.size}-${file.lastModified}`, file]))
      incoming.forEach(file => {
        const key = `${file.name}-${file.size}-${file.lastModified}`
        if (!seen.has(key)) {
          seen.set(key, file)
        }
      })
      return Array.from(seen.values())
    })
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    appendFiles(e.target.files)
    setIsUploadPanelOpen(false)
    e.target.value = ''
  }

  const handleRemoveFile = (target: File) => {
    setSelectedFiles(prev => prev.filter(file => file !== target))
  }

  const handleDropFiles = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    appendFiles(e.dataTransfer.files)
    setIsUploadPanelOpen(false)
  }

  const handleUploadKnowledgeFiles = async () => {
    if (!userToken) {
      alert('请先登录')
      return
    }
    let task = editingTask
    if (!task?.id) {
      task = await saveTask(false)
      if (!task) {
        return
      }
    }
    if (selectedFiles.length === 0) {
      alert('请先添加文件')
      return
    }

    setIsUploading(true)
    const total = selectedFiles.length
    for (let i = 0; i < total; i += 1) {
      const file = selectedFiles[i]
      setUploadStatus(`正在上传 ${i + 1}/${total}：${file.name}`)
      const formDataPayload = new FormData()
      const dataPayload = JSON.stringify({
        indexing_technique: 'high_quality',
        process_rule: {
          mode: 'automatic'
        }
      })
      formDataPayload.append('data', dataPayload)
      formDataPayload.append('file', file)

      try {
        const res = await axios.post(
          `${backendBaseUrl}/api/user/dify/tasks/${task.id}/kb/document/create-by-file`,
          formDataPayload,
          { headers: getHeaders() }
        )
        const newKnowledgeBaseId = res.data?.knowledgeBaseId
        if (newKnowledgeBaseId && newKnowledgeBaseId !== boundKnowledgeBaseId) {
          setBoundKnowledgeBaseId(newKnowledgeBaseId)
          setFormData(prev => ({ ...prev, knowledgeBaseId: newKnowledgeBaseId }))
          setEditingTask(prev => (prev ? { ...prev, knowledgeBaseId: newKnowledgeBaseId } : prev))
        }
      } catch (err: any) {
        setUploadStatus('上传失败: ' + (err.response?.data?.message || err.message))
        setIsUploading(false)
        return
      }
    }
    setUploadStatus('上传完成')
    setIsUploading(false)
  }

  const ToggleSwitch = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
    <div className={`switch-wrapper ${checked ? 'running' : ''}`}>
      <div className={`switch-component ${checked ? 'active' : ''}`} onClick={onChange}>
        <div className="switch-knob" />
      </div>
    </div>
  )

  if (view === 'form') {
    return (
      <div className="page task-page">
        <header className="page-header task-header">
          <div className="task-header-left">
            <button onClick={() => setView('list')} className="task-icon-button">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </button>
            <div className="task-header-text">
              <h4 className="page-title">任务配置</h4>
              <p className="task-subtitle">{editingTask ? '编辑任务信息与提示词模板' : '创建新的长期任务'}</p>
            </div>
          </div>
          <div className="page-header-actions">
            <button onClick={() => setView('list')} className="task-ghost-btn">返回列表</button>
            <button onClick={handleSave} className="btn-core-gradient task-primary-btn">保存任务</button>
          </div>
        </header>

        <div className="page-body">
          <div className="task-form-layout">
            <div className="card task-card">
              <div className="task-card-header">
                <div>
                  <h5 className="task-card-title">任务名称</h5>
                  <p className="task-card-subtitle">用于识别该任务，建议 2-15 个字符</p>
                </div>
                <span className="task-chip">长期任务</span>
              </div>
              <div className="task-card-body">
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="请输入任务名称（最多15个字符）"
                  maxLength={15}
                  className="task-input"
                />
              </div>
            </div>

            <div className="card task-card">
              <div className="task-card-header">
                <div>
                  <h5 className="task-card-title">任务内容</h5>
                  <p className="task-card-subtitle">描述任务目标、语气与输出格式</p>
                </div>
                <button onClick={openTemplateModal} className="task-link-btn">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                  任务提示词模版
                </button>
              </div>
              <div className="task-card-body">
                <div className="textarea-wrapper task-textarea">
                  <textarea
                    value={formData.content}
                    onChange={e => setFormData({ ...formData, content: e.target.value })}
                    placeholder="请输入长期任务的详细描述..."
                    className="task-textarea-field"
                  />
                </div>
                <div className="task-inline-actions">
                  <button className="task-pill-btn">
                    <span className="task-pill-icon">⚡</span>
                    AI优化
                  </button>
                </div>
              </div>
            </div>

            <div className="card task-card">
              <div className="task-card-header">
                <div>
                  <h5 className="task-card-title">知识库</h5>
                  <p className="task-card-subtitle">为任务提供知识增强与上下文信息</p>
                </div>
                <div className="task-card-actions">
                  <button className="task-secondary-btn" onClick={openKnowledgeModal}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    添加
                  </button>
                  <button className="task-danger-link">关闭</button>
                </div>
              </div>
              <div className="task-card-body">
                <div className="task-kb-status">
                  {boundKnowledgeBaseId ? `已绑定知识库：${boundKnowledgeBaseId}` : '未绑定知识库'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {isTemplateModalOpen && (
          <div className="task-modal-overlay">
            <div className="task-modal">
              <div className="task-modal-header">
                <div>
                  <h3 className="task-modal-title">任务提示词模板</h3>
                  <p className="task-modal-subtitle">选择合适的模板快速生成任务描述</p>
                </div>
                <button onClick={() => setIsTemplateModalOpen(false)} className="task-icon-button">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
              </div>
              <div className="task-modal-body">
                <table className="task-table">
                  <thead>
                    <tr>
                      <th>模版名称</th>
                      <th>模版内容</th>
                      <th className="task-table-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {templates.map(tpl => (
                      <tr key={tpl.id}>
                        <td className="task-table-title">{tpl.name}</td>
                        <td className="task-table-desc">
                          <div className="task-ellipsis">{tpl.content}</div>
                        </td>
                        <td className="task-table-right">
                          <button onClick={() => handleApplyTemplate(tpl)} className="task-primary-btn">应用</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="task-modal-footer">
                  <span>共 {templates.length} 个模版</span>
                  <div className="task-modal-actions">
                    <button onClick={() => fetchTemplates()} className="task-ghost-btn">刷新</button>
                    <button onClick={() => setIsTemplateModalOpen(false)} className="task-ghost-btn">关闭</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {isKnowledgeModalOpen && (
          <div className="task-modal-overlay">
            <div className="task-modal kb-modal">
              <div className="task-modal-header">
                <div>
                  <h3 className="task-modal-title">添加知识库</h3>
                  <p className="task-modal-subtitle">上传资料到当前绑定的知识库</p>
                </div>
                <button onClick={closeKnowledgeModal} className="task-icon-button">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
              </div>
              <div className="task-modal-body">
                {!isUploadPanelOpen ? (
                  <div className="kb-modal-section">
                    <div className="kb-bound-hint">
                      当前知识库：{boundKnowledgeBaseId || '未绑定'}
                    </div>
                    <div className="kb-file-list-card">
                      <div className="kb-file-list-header">
                        <span>选择文件</span>
                        <div className="kb-file-actions">
                          <button type="button" className="task-secondary-btn" onClick={() => setIsUploadPanelOpen(true)}>
                            + 添加
                          </button>
                        </div>
                      </div>
                      <div className="kb-file-list">
                        {selectedFiles.length === 0 ? (
                          <div className="kb-file-empty">暂无文件</div>
                        ) : (
                          selectedFiles.map(file => (
                            <div key={`${file.name}-${file.lastModified}`} className="kb-file-item">
                              <div className="kb-file-info">
                                <span className="kb-file-name">{file.name}</span>
                                <span className="kb-file-meta">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                              </div>
                              <button type="button" className="kb-file-remove" onClick={() => handleRemoveFile(file)}>
                                删除
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                      {selectedFiles.length > 0 && <div className="kb-file-tip">已加载全部文件</div>}
                    </div>
                    {uploadStatus && (
                      <div className={`kb-upload-status ${uploadStatus.includes('失败') ? 'error' : 'success'}`}>
                        {uploadStatus}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="kb-upload-panel">
                    <div
                      className={`kb-dropzone ${isDragging ? 'dragging' : ''}`}
                      onDragOver={(e) => {
                        e.preventDefault()
                        setIsDragging(true)
                      }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={handleDropFiles}
                    >
                      <input
                        id="kb-file-input"
                        type="file"
                        multiple
                        className="kb-file-input"
                        onChange={handleFileInput}
                        disabled={isUploading}
                      />
                      <label htmlFor="kb-file-input" className="kb-dropzone-content">
                        <div className="kb-dropzone-title">点击或拖拽文件到此区域上传</div>
                        <div className="kb-dropzone-subtitle">支持 PDF、Word、文本文件，单个不超过 10MB</div>
                      </label>
                    </div>
                  </div>
                )}
                <div className="task-modal-footer">
                  <span>已选择 {selectedFiles.length} 个文件</span>
                  <div className="task-modal-actions">
                    {isUploadPanelOpen && (
                      <button type="button" className="task-ghost-btn" onClick={() => setIsUploadPanelOpen(false)}>
                        返回
                      </button>
                    )}
                    <button type="button" className="task-ghost-btn" onClick={closeKnowledgeModal}>
                      取消
                    </button>
                    <button
                      type="button"
                      className="btn-core-gradient task-primary-btn"
                      onClick={handleUploadKnowledgeFiles}
                      disabled={isUploading}
                    >
                      {isUploading ? '上传中...' : '保存'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="page task-page">
      <header className="page-header task-header">
        <div>
          <h4 className="page-title">任务设置</h4>
          <p className="task-subtitle">集中管理任务、模板与运行状态</p>
        </div>
        <div className="page-header-actions">
          <button
            onClick={() => {
              setFormData({
                name: '',
                content: '',
                type: '长期任务',
                status: 'PENDING',
                knowledgeBaseId: ''
              })
              setBoundKnowledgeBaseId('')
              setEditingTask(null)
              setView('form')
            }}
            className="btn-core-gradient task-primary-btn"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            添加任务
          </button>
        </div>
      </header>

      <div className="page-body">
        <div className="card task-card task-table-card">
          <div className="task-table-header">
            <div>
              <h5 className="task-card-title">任务列表</h5>
              <p className="task-card-subtitle">当前共 {tasks.length} 个任务</p>
            </div>
            <button onClick={() => fetchTasks()} className="task-ghost-btn">刷新列表</button>
          </div>
          <div className="task-table-wrapper">
            <table className="task-table">
              <thead>
                <tr>
                  <th className="col-name">任务名称</th>
                  <th className="col-desc">任务描述</th>
                  <th className="col-user">用户</th>
                  <th className="col-type">任务类型</th>
                  <th className="col-status">开启状态</th>
                  <th className="col-action task-table-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map(task => (
                  <tr key={task.id}>
                    <td className="task-table-title">{task.name}</td>
                    <td className="task-table-desc">
                      <div className="task-ellipsis">{task.content}</div>
                    </td>
                    <td className="task-table-meta">默认用户</td>
                    <td>
                      <span className="task-type-badge">{task.type || '长期任务'}</span>
                    </td>
                    <td>
                      <ToggleSwitch checked={task.status === 'RUNNING'} onChange={() => handleToggleStatus(task)} />
                    </td>
                    <td className="task-table-right">
                      <div className="task-table-actions">
                        <button onClick={() => handleEdit(task)} className="task-icon-btn-only" data-tooltip="编辑">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button onClick={() => handleDelete(task.id)} className="task-icon-btn-only danger" data-tooltip="删除">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {tasks.length === 0 && !loading && (
                  <tr>
                    <td colSpan={6}>
                      <div className="task-empty">
                        <div className="task-empty-icon">✨</div>
                        <div className="task-empty-title">暂无任务</div>
                        <div className="task-empty-subtitle">点击右上角按钮创建你的第一个任务</div>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
