本项目用来开发chrome插件，为网页使用大模型提供预装prompt，节省用户针对固定任务的prompt调试时间

## 开发/测试

安装依赖：

```bash
npm install
```

默认入口为 `src/main.ts`：

```bash
npm run dev
```

通过环境变量切换入口脚本（无需改 `vite.config.ts`）：

```bash
VITE_ENTRY=src/hello_world.ts npm run dev
```

```bash
VITE_ENTRY=src/main-back.ts npm run dev
```
