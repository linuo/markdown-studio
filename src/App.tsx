import { useState, useRef, useCallback, useEffect } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { EditorView } from '@codemirror/view'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { oneDark } from '@codemirror/theme-one-dark'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import 'highlight.js/styles/atom-one-dark.css'
import './App.css'
import type { DesktopAppCommand } from './electron'

const SAMPLE = `# Welcome to MD Studio

A **live** markdown editor — edit on the left, preview on the right.

## Features

- Real-time preview as you type
- Drag the center divider to resize panes
- Scroll sync between editor and preview
- Open & save local \`.md\` files (\`⌘O\` / \`⌘S\` / \`⇧⌘S\`)

## Code

\`\`\`typescript
const greet = (name: string) => \`Hello, \${name}!\`
console.log(greet('World'))
\`\`\`

## Table

| Feature       | Status |
|---------------|--------|
| Live preview  | ✅     |
| Scroll sync   | ✅     |
| Open / Save   | ✅     |
| Resize panes  | ✅     |

## Blockquote

> "The best markdown editor is the one you actually use."

---

*Happy writing!*
`

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  highlight(str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return `<pre class="hljs"><code>${
          hljs.highlight(str, { language: lang, ignoreIllegals: true }).value
        }</code></pre>`
      } catch (_) {
        // noop
      }
    }
    return `<pre class="hljs"><code>${MarkdownIt().utils.escapeHtml(str)}</code></pre>`
  },
})

interface FSFileHandle {
  getFile(): Promise<File>
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>
}

declare global {
  interface Window {
    showOpenFilePicker?(opts?: object): Promise<FSFileHandle[]>
    showSaveFilePicker?(opts?: object): Promise<FSFileHandle>
  }
}

const claudeHeadings = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.heading, color: '#bf5b2a', fontWeight: 'bold' },
  ])
)

type Theme = 'dark' | 'light'

type Tab = {
  id: string
  doc: string
  filename: string
  filePath: string | null
  lastUpdatedAt: number | null
  modified: boolean
  fileHandle: FSFileHandle | null
  isSample: boolean
}

type OpenedTabPayload = {
  name: string
  content: string
  modifiedAt: number | null
  path?: string | null
  fileHandle?: FSFileHandle | null
}

function isDesktopMode() {
  return typeof window !== 'undefined' && Boolean(window.mdStudioDesktop)
}

function createUntitledTab(id: string): Tab {
  return {
    id,
    doc: SAMPLE,
    filename: 'untitled.md',
    filePath: null,
    lastUpdatedAt: null,
    modified: false,
    fileHandle: null,
    isSample: true,
  }
}

function formatTimestamp(value: number | null) {
  if (!value) return 'Not saved yet'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(value)
}

function canReuseTab(tab: Tab | undefined) {
  return Boolean(tab && !tab.modified && !tab.filePath && tab.isSample)
}

export default function App() {
  const nextTabIdRef = useRef(2)
  const initialTab = createUntitledTab('tab-1')

  const [tabs, setTabs] = useState<Tab[]>([initialTab])
  const [activeTabId, setActiveTabId] = useState(initialTab.id)
  const [editingTabId, setEditingTabId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [splitPct, setSplitPct] = useState(50)
  const [dragging, setDragging] = useState(false)
  const [theme, setTheme] = useState<Theme>('light')

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0]

  const containerRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const syncRef = useRef(false)
  const activeTabRef = useRef(activeTab)
  const activeTabIdRef = useRef(activeTabId)

  const desktop = isDesktopMode()
  const html = md.render(activeTab.doc)
  const lastUpdatedLabel = formatTimestamp(activeTab.lastUpdatedAt)

  useEffect(() => {
    activeTabRef.current = activeTab
  }, [activeTab])

  useEffect(() => {
    activeTabIdRef.current = activeTabId
  }, [activeTabId])

  const updateTab = useCallback((tabId: string, updater: (tab: Tab) => Tab) => {
    setTabs((currentTabs) => currentTabs.map((tab) => (
      tab.id === tabId ? updater(tab) : tab
    )))
  }, [])

  const createTabId = useCallback(() => {
    const id = `tab-${nextTabIdRef.current}`
    nextTabIdRef.current += 1
    return id
  }, [])

  const applyPayloadToTab = useCallback((tabId: string, payload: OpenedTabPayload) => {
    updateTab(tabId, (tab) => ({
      ...tab,
      doc: payload.content,
      filename: payload.name,
      filePath: payload.path ?? null,
      lastUpdatedAt: payload.modifiedAt,
      modified: false,
      fileHandle: payload.fileHandle ?? null,
      isSample: false,
    }))
  }, [updateTab])

  const openPayloadInTabs = useCallback((payload: OpenedTabPayload) => {
    const currentActiveId = activeTabIdRef.current

    setTabs((currentTabs) => {
      const active = currentTabs.find((tab) => tab.id === currentActiveId)
      if (canReuseTab(active)) {
        return currentTabs.map((tab) => (
          tab.id === currentActiveId
            ? {
                ...tab,
                doc: payload.content,
                filename: payload.name,
                filePath: payload.path ?? null,
                lastUpdatedAt: payload.modifiedAt,
                modified: false,
                fileHandle: payload.fileHandle ?? null,
                isSample: false,
              }
            : tab
        ))
      }

      const newTabId = createTabId()
      setActiveTabId(newTabId)
      return [
        ...currentTabs,
        {
          id: newTabId,
          doc: payload.content,
          filename: payload.name,
          filePath: payload.path ?? null,
          lastUpdatedAt: payload.modifiedAt,
          modified: false,
          fileHandle: payload.fileHandle ?? null,
          isSample: false,
        },
      ]
    })
  }, [createTabId])

  const handleChange = useCallback((value: string) => {
    const currentTabId = activeTabIdRef.current
    updateTab(currentTabId, (tab) => ({
      ...tab,
      doc: value,
      modified: true,
      isSample: false,
    }))
  }, [updateTab])

  const confirmTabDiscard = useCallback((tab: Tab) => {
    if (!tab.modified) return true
    return window.confirm(`"${tab.filename}" has unsaved changes. Continue?`)
  }, [])

  const onCreateEditor = useCallback((view: EditorView) => {
    view.scrollDOM.addEventListener('scroll', () => {
      if (syncRef.current || !previewRef.current) return
      syncRef.current = true
      const { scrollTop, scrollHeight, clientHeight } = view.scrollDOM
      const pct = scrollTop / Math.max(1, scrollHeight - clientHeight)
      const preview = previewRef.current
      preview.scrollTop = pct * (preview.scrollHeight - preview.clientHeight)
      requestAnimationFrame(() => {
        syncRef.current = false
      })
    }, { passive: true })
  }, [])

  const onDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setDragging(true)
  }, [])

  useEffect(() => {
    if (!dragging) return

    const onMove = (e: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const pct = ((e.clientX - rect.left) / rect.width) * 100
      setSplitPct(Math.max(20, Math.min(80, pct)))
    }

    const onUp = () => setDragging(false)

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [dragging])

  const saveAsFile = useCallback(async () => {
    const currentTab = activeTabRef.current

    try {
      if (desktop && window.mdStudioDesktop) {
        const result = await window.mdStudioDesktop.saveFile({
          path: currentTab.filePath,
          content: currentTab.doc,
          defaultPath: currentTab.filename,
          saveAs: true,
        })

        if (!result) return

        updateTab(currentTab.id, (tab) => ({
          ...tab,
          filePath: result.path,
          filename: result.name,
          lastUpdatedAt: result.modifiedAt,
          modified: false,
          isSample: false,
        }))
        return
      }

      if (window.showSaveFilePicker) {
        const handle = await window.showSaveFilePicker({
          suggestedName: currentTab.filename,
          types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md'] } }],
        })
        const writable = await handle.createWritable()
        await writable.write(currentTab.doc)
        await writable.close()
        const file = await handle.getFile()

        updateTab(currentTab.id, (tab) => ({
          ...tab,
          filename: file.name,
          fileHandle: handle,
          filePath: null,
          lastUpdatedAt: file.lastModified || Date.now(),
          modified: false,
          isSample: false,
        }))
        return
      }

      const blob = new Blob([currentTab.doc], { type: 'text/markdown' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = currentTab.filename
      anchor.click()
      URL.revokeObjectURL(url)

      updateTab(currentTab.id, (tab) => ({
        ...tab,
        lastUpdatedAt: Date.now(),
        modified: false,
        isSample: false,
      }))
    } catch (error) {
      if ((error as DOMException).name !== 'AbortError') {
        console.error(error)
      }
    }
  }, [desktop, updateTab])

  const saveFile = useCallback(async () => {
    const currentTab = activeTabRef.current

    try {
      if (desktop && window.mdStudioDesktop) {
        const result = await window.mdStudioDesktop.saveFile({
          path: currentTab.filePath,
          content: currentTab.doc,
          defaultPath: currentTab.filename,
        })

        if (!result) return

        updateTab(currentTab.id, (tab) => ({
          ...tab,
          filePath: result.path,
          filename: result.name,
          lastUpdatedAt: result.modifiedAt,
          modified: false,
          isSample: false,
        }))
        return
      }

      if (currentTab.fileHandle) {
        const writable = await currentTab.fileHandle.createWritable()
        await writable.write(currentTab.doc)
        await writable.close()
        const file = await currentTab.fileHandle.getFile()

        updateTab(currentTab.id, (tab) => ({
          ...tab,
          lastUpdatedAt: file.lastModified || Date.now(),
          modified: false,
          isSample: false,
        }))
        return
      }

      await saveAsFile()
    } catch (error) {
      console.error(error)
    }
  }, [desktop, saveAsFile, updateTab])

  const openFile = useCallback(async () => {
    try {
      if (desktop && window.mdStudioDesktop) {
        const payload = await window.mdStudioDesktop.openFileDialog()
        if (payload) {
          openPayloadInTabs({
            name: payload.name,
            content: payload.content,
            modifiedAt: payload.modifiedAt,
            path: payload.path,
          })
        }
        return
      }

      if (window.showOpenFilePicker) {
        const [handle] = await window.showOpenFilePicker({
          types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown'] } }],
        })
        const file = await handle.getFile()
        openPayloadInTabs({
          name: file.name,
          content: await file.text(),
          modifiedAt: file.lastModified,
          fileHandle: handle,
        })
        return
      }

      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.md,.markdown'
      input.onchange = async () => {
        const file = input.files?.[0]
        if (!file) return
        openPayloadInTabs({
          name: file.name,
          content: await file.text(),
          modifiedAt: file.lastModified,
        })
      }
      input.click()
    } catch (error) {
      if ((error as DOMException).name !== 'AbortError') {
        console.error(error)
      }
    }
  }, [desktop, openPayloadInTabs])

  const closeTab = useCallback((tabId: string) => {
    const tab = tabs.find((item) => item.id === tabId)
    if (!tab) return
    if (!confirmTabDiscard(tab)) return

    const closingIndex = tabs.findIndex((item) => item.id === tabId)
    const remainingTabs = tabs.filter((item) => item.id !== tabId)

    if (remainingTabs.length === 0) {
      const freshTab = createUntitledTab(createTabId())
      setTabs([freshTab])
      setActiveTabId(freshTab.id)
      return
    }

    setTabs(remainingTabs)
    if (activeTabId === tabId) {
      const fallbackTab = remainingTabs[Math.max(0, closingIndex - 1)] ?? remainingTabs[0]
      setActiveTabId(fallbackTab.id)
    }
  }, [activeTabId, confirmTabDiscard, createTabId, tabs])

  const createEmptyTab = useCallback(() => {
    const newTab = createUntitledTab(createTabId())
    setTabs((currentTabs) => [...currentTabs, newTab])
    setActiveTabId(newTab.id)
  }, [createTabId])

  const startTabRename = useCallback((tab: Tab) => {
    setEditingTabId(tab.id)
    setEditingName(tab.filename)
  }, [])

  const cancelTabRename = useCallback(() => {
    setEditingTabId(null)
    setEditingName('')
  }, [])

  const commitTabRename = useCallback(async (tabId: string) => {
    const tab = tabs.find((item) => item.id === tabId)
    if (!tab) {
      cancelTabRename()
      return
    }

    const rawName = editingName.trim()
    if (!rawName || rawName === tab.filename) {
      cancelTabRename()
      return
    }

    let nextName = rawName
    const ext = tab.filename.endsWith('.markdown')
      ? '.markdown'
      : tab.filename.endsWith('.md')
        ? '.md'
        : ''

    if (!/\.[^./]+$/.test(nextName) && ext) {
      nextName = `${nextName}${ext}`
    }

    try {
      if (desktop && window.mdStudioDesktop && tab.filePath) {
        const result = await window.mdStudioDesktop.renameFile({
          path: tab.filePath,
          nextName,
        })

        updateTab(tab.id, (currentTab) => ({
          ...currentTab,
          filename: result.name,
          filePath: result.path,
          lastUpdatedAt: result.modifiedAt,
          isSample: false,
        }))
      } else {
        updateTab(tab.id, (currentTab) => ({
          ...currentTab,
          filename: nextName,
          fileHandle: currentTab.filePath ? currentTab.fileHandle : null,
          isSample: false,
        }))
      }
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error))
    } finally {
      cancelTabRename()
    }
  }, [cancelTabRename, desktop, editingName, tabs, updateTab])

  const focusRelativeTab = useCallback((direction: -1 | 1) => {
    const currentIndex = tabs.findIndex((tab) => tab.id === activeTabIdRef.current)
    if (currentIndex === -1 || tabs.length <= 1) return

    const nextIndex = (currentIndex + direction + tabs.length) % tabs.length
    setActiveTabId(tabs[nextIndex].id)
  }, [tabs])

  const focusTabByIndex = useCallback((index: number) => {
    if (index < 0 || index >= tabs.length) return
    setActiveTabId(tabs[index].id)
  }, [tabs])

  const runAppCommand = useCallback((command: DesktopAppCommand) => {
    if (command === 'new-tab') {
      createEmptyTab()
      return
    }

    if (command === 'open') {
      void openFile()
      return
    }

    if (command === 'save') {
      void saveFile()
      return
    }

    void saveAsFile()
  }, [createEmptyTab, openFile, saveAsFile, saveFile])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault()
        focusRelativeTab(-1)
        return
      }

      if (mod && e.altKey && e.key === 'ArrowRight') {
        e.preventDefault()
        focusRelativeTab(1)
        return
      }

      if (!mod) return

      if (!e.altKey && !e.shiftKey && /^[1-9]$/.test(e.key)) {
        e.preventDefault()
        const targetIndex = Number(e.key) - 1
        focusTabByIndex(targetIndex)
        return
      }

      if (e.key.toLowerCase() === 't' && !e.shiftKey && !e.altKey) {
        e.preventDefault()
        createEmptyTab()
        return
      }

      if (e.key === 's') {
        e.preventDefault()
        if (e.shiftKey) {
          void saveAsFile()
        } else {
          void saveFile()
        }
      }

      if (e.key === 'o') {
        e.preventDefault()
        void openFile()
        return
      }

      if (e.key.toLowerCase() === 'w') {
        if (tabs.length <= 1) {
          return
        }

        e.preventDefault()
        closeTab(activeTabRef.current.id)
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [closeTab, createEmptyTab, focusRelativeTab, focusTabByIndex, openFile, saveAsFile, saveFile, tabs.length])

  useEffect(() => {
    if (!desktop || !window.mdStudioDesktop) return
    void window.mdStudioDesktop.updateWindowState({ edited: activeTab.modified, filePath: activeTab.filePath })
  }, [activeTab.filePath, activeTab.modified, desktop])

  useEffect(() => {
    if (!desktop || !window.mdStudioDesktop) return

    if (!activeTab.filePath) {
      void window.mdStudioDesktop.stopWatchingFile()
      return
    }

    void window.mdStudioDesktop.startWatchingFile(activeTab.filePath)
  }, [activeTab.filePath, activeTab.id, desktop])

  useEffect(() => {
    document.title = `${activeTab.filename}${activeTab.modified ? ' ●' : ''} - MD Studio`
  }, [activeTab.filename, activeTab.modified])

  useEffect(() => {
    if (!desktop || !window.mdStudioDesktop) return

    void window.mdStudioDesktop.getPendingOpenFile().then((payload) => {
      if (!payload) return
      openPayloadInTabs({
        name: payload.name,
        content: payload.content,
        modifiedAt: payload.modifiedAt,
        path: payload.path,
      })
    })

    const detachOpen = window.mdStudioDesktop.onExternalOpenFile((payload) => {
      openPayloadInTabs({
        name: payload.name,
        content: payload.content,
        modifiedAt: payload.modifiedAt,
        path: payload.path,
      })
    })

    const detachExternalChange = window.mdStudioDesktop.onExternalFileChange((payload) => {
      const currentTab = activeTabRef.current
      if (currentTab.filePath !== payload.path) {
        return
      }

      const sameTimestamp = currentTab.lastUpdatedAt === payload.modifiedAt
      const sameContent = currentTab.doc === payload.content
      if (sameTimestamp || sameContent) {
        updateTab(currentTab.id, (tab) => ({ ...tab, lastUpdatedAt: payload.modifiedAt }))
        return
      }

      if (!currentTab.modified) {
        applyPayloadToTab(currentTab.id, {
          name: payload.name,
          content: payload.content,
          modifiedAt: payload.modifiedAt,
          path: payload.path,
        })
        return
      }

      const shouldReload = window.confirm(
        `"${currentTab.filename}" changed on disk and has unsaved changes here. Reload from disk and discard your edits?`
      )

      if (shouldReload) {
        applyPayloadToTab(currentTab.id, {
          name: payload.name,
          content: payload.content,
          modifiedAt: payload.modifiedAt,
          path: payload.path,
        })
        return
      }

      updateTab(currentTab.id, (tab) => ({ ...tab, lastUpdatedAt: payload.modifiedAt }))
    })

    const detachWatchError = window.mdStudioDesktop.onWatchError((payload) => {
      window.alert(`File watch failed for ${payload.path}\n${payload.message}`)
    })

    const detachCommand = window.mdStudioDesktop.onAppCommand((command) => {
      runAppCommand(command)
    })

    return () => {
      detachOpen()
      detachExternalChange()
      detachWatchError()
      detachCommand()
    }
  }, [applyPayloadToTab, desktop, openPayloadInTabs, runAppCommand, updateTab])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    const file = Array.from(e.dataTransfer.files).find(
      (item) => item.name.endsWith('.md') || item.name.endsWith('.markdown')
    )

    if (!file) return

    const droppedPath = 'path' in file && typeof file.path === 'string' ? file.path : null
    openPayloadInTabs({
      name: file.name,
      content: await file.text(),
      modifiedAt: file.lastModified,
      path: desktop ? droppedPath : null,
    })
  }, [desktop, openPayloadInTabs])

  return (
    <div className="app" data-theme={theme} onDragOver={onDragOver} onDrop={onDrop}>
      <div className="tabs-bar">
        <div className="tabs-strip">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`tab-chip${tab.id === activeTab.id ? ' active' : ''}`}
              onClick={() => setActiveTabId(tab.id)}
              onDoubleClick={() => startTabRename(tab)}
            >
              {editingTabId === tab.id ? (
                <input
                  autoFocus
                  className="tab-chip-input"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={() => void commitTabRename(tab.id)}
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void commitTabRename(tab.id)
                    }

                    if (e.key === 'Escape') {
                      e.preventDefault()
                      cancelTabRename()
                    }
                  }}
                />
              ) : (
                <span className="tab-chip-label">{tab.filename}{tab.modified ? ' ●' : ''}</span>
              )}
              <span
                className="tab-chip-close"
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(tab.id)
                }}
              >
                ×
              </span>
            </button>
          ))}
        </div>
        <div className="tabs-meta">
          <span className="updated-at">Updated {lastUpdatedLabel}</span>
          <select value={theme} onChange={(e) => setTheme(e.target.value as Theme)}>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </div>
      </div>

      <div
        className="workspace"
        ref={containerRef}
        style={{ cursor: dragging ? 'col-resize' : undefined }}
      >
        <div className="pane editor-pane" style={{ width: `${splitPct}%` }}>
          <CodeMirror
            value={activeTab.doc}
            className="editor-cm"
            height="100%"
            theme={theme === 'dark' ? oneDark : 'light'}
            extensions={[
              markdown({ base: markdownLanguage, codeLanguages: languages }),
              EditorView.lineWrapping,
              ...(theme === 'light' ? [claudeHeadings] : []),
            ]}
            onChange={handleChange}
            onCreateEditor={onCreateEditor}
            basicSetup={{
              lineNumbers: true,
              foldGutter: false,
              highlightActiveLine: true,
              autocompletion: false,
            }}
          />
        </div>

        <div
          className={`divider${dragging ? ' active' : ''}`}
          onMouseDown={onDividerMouseDown}
        />

        <div className="pane preview-pane" ref={previewRef}>
          <div
            className="preview-content"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>
    </div>
  )
}
