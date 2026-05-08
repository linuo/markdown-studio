export type DesktopFile = {
  path: string
  name: string
  content: string
  modifiedAt: number
}

export type DesktopAppCommand = 'new-tab' | 'open' | 'save' | 'save-as'

export type DesktopSavePayload = {
  path?: string | null
  content: string
  defaultPath?: string
  saveAs?: boolean
}

export type DesktopRenamePayload = {
  path: string
  nextName: string
}

declare global {
  interface Window {
    mdStudioDesktop?: {
      openFileDialog(): Promise<DesktopFile | null>
      getPendingOpenFile(): Promise<DesktopFile | null>
      saveFile(payload: DesktopSavePayload): Promise<{ path: string; name: string; modifiedAt: number } | null>
      renameFile(payload: DesktopRenamePayload): Promise<{ path: string; name: string; modifiedAt: number }>
      startWatchingFile(filePath: string): Promise<void>
      stopWatchingFile(): Promise<void>
      updateWindowState(payload: { edited: boolean; filePath?: string | null }): Promise<void>
      onExternalOpenFile(callback: (payload: DesktopFile) => void): () => void
      onExternalFileChange(callback: (payload: DesktopFile) => void): () => void
      onWatchError(callback: (payload: { path: string; message: string }) => void): () => void
      onAppCommand(callback: (command: DesktopAppCommand) => void): () => void
    }
  }
}

export {}
