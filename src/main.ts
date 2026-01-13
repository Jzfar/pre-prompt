// Adapted from src/tmp for Vite userscript build.
(function () {
  'use strict'

  const PANEL_ID = 'deepseek-mode-panel-v3'
  const TAB_ID = 'deepseek-mode-tab-v3'
  const LS_KEY = 'deepseek_mode_v3'
  const LS_AUTO = 'deepseek_mode_auto_v3'
  const LS_COLLAPSED = 'deepseek_panel_collapsed_v3'

  const PROMPT_MODES: Record<string, string> = {
    'Reddit 润色': `你是一个资深的 Reddit 用户。请将我接下来发送的文本润色成地道的 Reddit 社区风格英文。
要求：
1. 口语化、带有梗或缩写（如 IMO, TIL, AFAIK 等）。
2. 语气轻松自然，不要像教科书。
3. 保持原意。

需要润色的文本如下：
`,
    '代码解释': `请作为一名资深工程师，解释以下代码的逻辑，并指出潜在的 Bug：\n\n`,
    '中译英(学术)': `请将以下中文翻译成学术风格的英文，用于论文发表。要求用词精准、句式正式：\n\n`,
    '简单总结': `TL;DR，请用一句话总结这段话的核心观点：\n\n`,
  }

  function log(...args: unknown[]) {
    console.log('[DeepSeek 助手]', ...args)
  }

  // -------- 输入框探测（textarea / contenteditable）--------
  function findInput():
    | { type: 'textarea'; el: HTMLTextAreaElement }
    | { type: 'contenteditable'; el: HTMLElement }
    | null {
    const ta = document.querySelector('textarea')
    if (ta) return { type: 'textarea', el: ta }

    // 许多聊天网站用 contenteditable
    const ce = document.querySelector('[contenteditable="true"]')
    if (ce) return { type: 'contenteditable', el: ce as HTMLElement }

    return null
  }

  // React/受控输入常用：原生 setter 才能让框架识别
  function setNativeValue(el: HTMLTextAreaElement, value: string) {
    const proto = Object.getPrototypeOf(el)
    const desc = Object.getOwnPropertyDescriptor(proto, 'value')
    if (desc && desc.set) desc.set.call(el, value)
    else el.value = value
  }

  function getInputText() {
    const input = findInput()
    if (!input) return null

    if (input.type === 'textarea') return input.el.value || ''
    return input.el.textContent || ''
  }

  function setInputText(text: string) {
    const input = findInput()
    if (!input) return false

    if (input.type === 'textarea') {
      setNativeValue(input.el, text)
      input.el.dispatchEvent(new Event('input', { bubbles: true }))
      input.el.focus()
      return true
    }

    // contenteditable
    input.el.focus()
    input.el.textContent = text
    input.el.dispatchEvent(new InputEvent('input', { bubbles: true }))
    return true
  }

  // -------- 模式状态管理 --------
  function getCurrentModeName() {
    return localStorage.getItem(LS_KEY) || ''
  }
  function setCurrentModeName(name: string) {
    localStorage.setItem(LS_KEY, name)
    updatePanelStatus()
  }
  function getAutoAppend() {
    return localStorage.getItem(LS_AUTO) === '1'
  }
  function setAutoAppend(v: boolean) {
    localStorage.setItem(LS_AUTO, v ? '1' : '0')
    updatePanelStatus()
  }
  function isCollapsed() {
    return localStorage.getItem(LS_COLLAPSED) === '1'
  }
  function setCollapsed(collapsed: boolean) {
    localStorage.setItem(LS_COLLAPSED, collapsed ? '1' : '0')
  }

  function migrateOldHiddenState() {
    const oldHidden = localStorage.getItem('ds_panel_hidden_v3')
    if (oldHidden === '1') {
      setCollapsed(true)
      localStorage.removeItem('ds_panel_hidden_v3')
      log('已迁移旧版隐藏状态到折叠状态')
    }
  }

  function buildPromptFor(text: string) {
    const mode = getCurrentModeName()
    if (!mode || !PROMPT_MODES[mode]) return null

    const prompt = PROMPT_MODES[mode]
    // 防止重复附加：用一个轻量 marker
    const marker = `\n[MODE:${mode}]\n`
    if (text.includes(marker)) return text // 已经拼过就不重复

    return prompt + marker + text
  }

  // -------- 面板 --------
  function createFullPanel() {
    if (document.getElementById(PANEL_ID)) return

    const panel = document.createElement('div')
    panel.id = PANEL_ID
    panel.style.cssText = `
      position: fixed;
      top: 120px;
      right: 18px;
      width: 190px;
      background: rgba(20,20,20,.92);
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 14px;
      padding: 12px;
      z-index: 2147483647;
      box-shadow: 0 10px 24px rgba(0,0,0,.35);
      display: flex;
      flex-direction: column;
      gap: 10px;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial;
      color: #eee;
      backdrop-filter: blur(8px);
      transition: opacity 0.2s ease-in-out, transform 0.2s ease-in-out, visibility 0.2s;
    `

    const header = document.createElement('div')
    header.style.cssText = `display:flex; align-items:center; justify-content:space-between; gap:8px;`
    header.innerHTML = `
      <div style="font-weight:700; font-size:14px;">🤖 任务模式</div>
      <button id="ds_collapse_btn" title="折叠" style="
        border:none; background:transparent; color:#bbb; cursor:pointer;
        font-size:16px; line-height:1; padding:2px 6px;
      ">－</button>
    `
    panel.appendChild(header)

    const status = document.createElement('div')
    status.id = 'ds_mode_status'
    status.style.cssText = `font-size:12px; color:#cfcfcf; line-height:1.35;`
    panel.appendChild(status)

    // 自动附加开关
    const autoRow = document.createElement('label')
    autoRow.style.cssText = `
      display:flex; align-items:center; justify-content:space-between;
      font-size:12px; color:#ddd; gap:10px;
      padding:8px; border-radius:10px;
      background: rgba(255,255,255,.06);
    `
    autoRow.innerHTML = `
      <span>自动附加 Prompt</span>
      <input id="ds_auto_toggle" type="checkbox" style="transform: scale(1.1);" />
    `
    panel.appendChild(autoRow)

    // 按钮区
    const btnWrap = document.createElement('div')
    btnWrap.style.cssText = `display:flex; flex-direction:column; gap:8px;`
    panel.appendChild(btnWrap)

    for (const [name, prompt] of Object.entries(PROMPT_MODES)) {
      const btn = document.createElement('button')
      btn.textContent = name
      btn.style.cssText = `
        background: rgba(77,107,254,.95);
        color: white;
        border: none;
        padding: 8px 10px;
        border-radius: 10px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 650;
        text-align: left;
        transition: transform .08s ease, opacity .12s ease;
      `
      btn.addEventListener('mousedown', () => (btn.style.transform = 'scale(0.98)'))
      btn.addEventListener('mouseup', () => (btn.style.transform = 'scale(1)'))

      // 单击：设为当前模式（记忆）
      btn.addEventListener('click', (event) => {
        setCurrentModeName(name)

        // 如果你想“手动填入 prompt”，按住 Alt 再点
        // （避免每次都把 prompt 塞进输入框）
        if (event.altKey) {
          setInputText(prompt)
        }

        const old = btn.textContent
        btn.textContent = '已选择 ✅'
        btn.style.opacity = '0.92'
        setTimeout(() => {
          btn.textContent = old
          btn.style.opacity = '1'
        }, 800)
      })

      btnWrap.appendChild(btn)
    }

    // 小工具：一键把当前模式 prompt 填进输入框（可选）
    const fillBtn = document.createElement('button')
    fillBtn.textContent = '把 Prompt 填入输入框'
    fillBtn.style.cssText = `
      margin-top: 2px;
      background: rgba(255,255,255,.08);
      color: #eee;
      border: 1px solid rgba(255,255,255,.10);
      padding: 8px 10px;
      border-radius: 10px;
      cursor: pointer;
      font-size: 12px;
      text-align: center;
    `
    fillBtn.addEventListener('click', () => {
      const mode = getCurrentModeName()
      if (!mode || !PROMPT_MODES[mode]) return alert('先选择一个模式')
      setInputText(PROMPT_MODES[mode])
    })
    panel.appendChild(fillBtn)

    document.documentElement.appendChild(panel)

    // 绑定折叠
    panel.querySelector('#ds_collapse_btn')?.addEventListener('click', () => {
      setCollapsed(true)
      updatePanelState()
      log('面板已折叠')
    })

    // 绑定开关
    const toggle = panel.querySelector<HTMLInputElement>('#ds_auto_toggle')
    if (toggle) {
      toggle.checked = getAutoAppend()
      toggle.addEventListener('change', () => setAutoAppend(toggle.checked))
    }

    updatePanelStatus()
    log('面板已注入')
  }

  function createCollapsedTab() {
    if (document.getElementById(TAB_ID)) return

    const tab = document.createElement('div')
    tab.id = TAB_ID
    tab.style.cssText = `
      position: fixed;
      top: 120px;
      right: 0px;
      width: 40px;
      height: 120px;
      background: rgba(20,20,20,.85);
      border: 1px solid rgba(255,255,255,.12);
      border-right: none;
      border-radius: 12px 0 0 12px;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      z-index: 2147483647;
      backdrop-filter: blur(8px);
      transition: opacity 0.2s ease-in-out, transform 0.2s ease-in-out, visibility 0.2s, background 0.2s ease;
      writing-mode: vertical-rl;
      text-orientation: mixed;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial;
      color: #eee;
      font-size: 14px;
      font-weight: 600;
      padding: 8px 4px;
    `
    tab.textContent = '🤖 任务模式'

    tab.addEventListener('click', () => {
      setCollapsed(false)
      updatePanelState()
      log('面板已展开')
    })

    tab.addEventListener('mouseenter', () => {
      tab.style.background = 'rgba(40,40,40,.9)'
    })

    tab.addEventListener('mouseleave', () => {
      tab.style.background = 'rgba(20,20,20,.85)'
    })

    document.documentElement.appendChild(tab)
  }

  function updatePanelState() {
    const panel = document.getElementById(PANEL_ID)
    const tab = document.getElementById(TAB_ID)

    if (isCollapsed()) {
      panel?.style.setProperty('opacity', '0')
      panel?.style.setProperty('visibility', 'hidden')
      panel?.style.setProperty('transform', 'translateX(100%)')

      tab?.style.setProperty('opacity', '1')
      tab?.style.setProperty('visibility', 'visible')
      tab?.style.setProperty('transform', 'translateX(0)')
      return
    }

    panel?.style.setProperty('opacity', '1')
    panel?.style.setProperty('visibility', 'visible')
    panel?.style.setProperty('transform', 'translateX(0)')

    tab?.style.setProperty('opacity', '0')
    tab?.style.setProperty('visibility', 'hidden')
    tab?.style.setProperty('transform', 'translateX(100%)')
  }

  function updatePanelStatus() {
    const panel = document.getElementById(PANEL_ID)
    if (!panel) return

    const mode = getCurrentModeName()
    const auto = getAutoAppend()
    const status = panel.querySelector('#ds_mode_status')
    if (!status) return

    status.innerHTML = `
      <div>当前模式：<b>${mode ? mode : '（未选择）'}</b></div>
      <div>自动附加：<b>${auto ? '开启' : '关闭'}</b></div>
      <div style="opacity:.85;margin-top:6px;">
        提示：<br/>
        • 单击按钮 = 选择模式（会记住）<br/>
        • <b>Alt+单击</b> = 选择模式并把 Prompt 填入输入框
      </div>
    `
  }

  // -------- 自动附加：在“发送”触发前拼 prompt --------
  function tryAutoAppendBeforeSend() {
    if (!getAutoAppend()) return

    const mode = getCurrentModeName()
    if (!mode || !PROMPT_MODES[mode]) return

    const current = getInputText()
    if (current == null) return

    // 空消息不处理
    if (!current.trim()) return

    const merged = buildPromptFor(current)
    if (!merged) return

    // 如果已经拼过 marker，就不重复
    if (merged === current) return

    setInputText(merged)
    log('已自动附加 prompt')
  }

  // 1) Enter 发送（捕获阶段尽量早）
  document.addEventListener(
    'keydown',
    (e) => {
      // 只处理 Enter，不处理 Shift+Enter 换行
      if (e.key !== 'Enter' || e.shiftKey) return

      const input = findInput()
      if (!input) return

      // 只在焦点在输入框内时触发
      const active = document.activeElement
      if (active !== input.el && !input.el.contains(active)) return

      // 在发送前把内容改好
      tryAutoAppendBeforeSend()
    },
    true,
  )

  // 2) 点击发送按钮（不同站按钮结构不同，这里用“尽量泛化”的点击捕获）
  document.addEventListener(
    'click',
    (e) => {
      if (!getAutoAppend()) return
      const t = e.target
      if (!(t instanceof HTMLElement)) return

      // 常见：button / svg / span 在 button 内
      const btn = t.closest && t.closest('button')
      if (!btn) return

      // 经验型判断：按钮可能带 aria-label / title / data-testid
      const label = (
        btn.getAttribute('aria-label') ||
        btn.getAttribute('title') ||
        btn.textContent ||
        ''
      ).toLowerCase()
      const looksLikeSend =
        label.includes('send') || label.includes('发送') || label.includes('submit')

      if (looksLikeSend) {
        tryAutoAppendBeforeSend()
      }
    },
    true,
  )

  // -------- SPA 自恢复：页面重绘/切换会把面板弄没 --------
  function ensurePanel() {
    const panel = document.getElementById(PANEL_ID)
    const tab = document.getElementById(TAB_ID)

    if (!panel) createFullPanel()
    if (!tab) createCollapsedTab()
    updatePanelState()
  }

  migrateOldHiddenState()
  ensurePanel()

  const mo = new MutationObserver(() => ensurePanel())
  mo.observe(document.documentElement, { childList: true, subtree: true })
})()
