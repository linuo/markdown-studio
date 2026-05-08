# MD Studio

Markdown desktop editor with live preview, multi-tab editing, native file open/save, and external file change sync.

## Run

```bash
npm install
npm run desktop
```

## Shortcuts

- `Cmd+O`: Open markdown file
- `Cmd+T`: New empty markdown tab
- `Cmd+S`: Save current tab
- `Shift+Cmd+S`: Save current tab as
- `Cmd+W`: Close current tab; if it is the last tab, close the window
- `Cmd+Option+Left`: Focus previous tab
- `Cmd+Option+Right`: Focus next tab
- `Cmd+1` to `Cmd+9`: Focus tab by position

## Notes

- File changes made by other apps auto-refresh the current tab when it has no unsaved edits.
- If the current tab has unsaved edits, MD Studio asks before reloading disk changes.
- `Cmd+O` reuses the current sample tab if it is still untouched; otherwise it opens a new tab.
