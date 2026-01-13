const HELLO_ID = '__hello_world_banner__'

const existing = document.getElementById(HELLO_ID)
if (existing) existing.remove()

const banner = document.createElement('div')
banner.id = HELLO_ID
banner.textContent = 'Hello World from userscript'
banner.style.cssText = `
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 2147483647;
  background: #0b5;
  color: #fff;
  padding: 8px 12px;
  border-radius: 10px;
  font: 13px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial;
  box-shadow: 0 8px 20px rgba(0,0,0,.25);
`

document.documentElement.appendChild(banner)
console.log('[hello_world] injected')
