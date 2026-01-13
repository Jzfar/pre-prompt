import { defineConfig, loadEnv } from 'vite'
import monkey from 'vite-plugin-monkey'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const entry = env.VITE_ENTRY || 'src/main.ts'

  return {
    plugins: [
      monkey({
        entry,
        userscript: {
          name: 'LLM 任务模式助手 (Dev)',
          namespace: 'http://tampermonkey.net/',
          version: '0.0.0-dev',
          description: '模式面板 + 自动附加 prompt（开发热更新版）',
          match: [
            'https://chat.deepseek.com/*',
            'https://chatgpt.com/*',
            'https://chat.openai.com/*',
            'https://gemini.google.com/*',
            'https://grok.com/*',
            'https://tongyi.aliyun.com/*'
          ],
          run_at: 'document-idle'
        },
        // 开发体验关键：本地 dev server 输出 userscript，并带更新提示
        server: {
          mountGmApi: true,
        },
      }),
    ],
  }
})
