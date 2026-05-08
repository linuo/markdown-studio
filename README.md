# MD Studio

[English](./README.en.md)

MD Studio 是一个面向桌面场景的 Markdown 编辑器，支持实时预览、多标签页、本地文件关联、外部文件变更同步，以及常用键盘快捷键驱动的工作流。

## 截图

### 浅色主题

![MD Studio Light](./docs/assets/readme/overview-light.png)

### 暗色主题

![MD Studio Dark](./docs/assets/readme/overview-dark.png)

## 功能

- 实时双栏预览：左侧编辑，右侧即时渲染
- 桌面文件工作流：打开、保存、另存为、本地文件关联
- 多标签页：同时编辑多个 Markdown 文件
- 外部文件同步：其他程序改动当前文件时自动刷新或提示覆盖
- 主题切换：浅色 / 暗色
- 标签重命名：双击标签页名称即可修改

## 启动

### 安装依赖

```bash
npm install
```

### 开发启动桌面版

```bash
npm run desktop
```

### 生成安装包

```bash
npm run dist
```

## 快捷键

| 快捷键 | 说明 |
| --- | --- |
| `Cmd+O` | 打开 Markdown 文件 |
| `Cmd+T` | 新建空白标签页 |
| `Cmd+S` | 保存当前标签页 |
| `Shift+Cmd+S` | 当前标签页另存为 |
| `Cmd+W` | 关闭当前标签页；若只剩最后一个标签，则关闭窗口 |
| `Cmd+Option+Left` | 切换到左侧标签页 |
| `Cmd+Option+Right` | 切换到右侧标签页 |
| `Cmd+1` 到 `Cmd+9` | 跳转到对应位置的标签页 |
| `Enter` | 在标签重命名输入框中提交 |
| `Esc` | 在标签重命名输入框中取消 |

## 文件行为

- 当前标签页没有未保存修改时：
  外部程序改动同一文件后，MD Studio 会自动刷新内容。
- 当前标签页存在未保存修改时：
  外部程序改动同一文件后，MD Studio 会提示是否用磁盘版本覆盖。
- 双击 `.md` / `.markdown` 文件：
  打包后的桌面应用可以注册为系统默认编辑器。

## 项目结构

```text
src/          React 前端界面与编辑器逻辑
electron/     Electron 主进程与 preload 桥接
docs/assets/  README 截图资源
```

## 技术栈

- React 18
- Vite
- TypeScript
- Electron
- CodeMirror 6
- markdown-it
- highlight.js
