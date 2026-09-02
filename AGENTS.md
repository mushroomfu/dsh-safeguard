# AGENTS.md — dsh-safeguard

DSH Web GUI 插件：Codex 风格、模型判定的命令权限守卫。独立仓库，仓库根目录即
包根目录（`package.json` / `src/` / `tests/` 平铺在根目录）。

## 本包要点

- 判定是纯数据：`src/core/`（types / classify / policy）不得 import cordis、
  runtime 或任何 `@deepseek-ai/*` 值，保证两侧与测试复用同一份逻辑。
- 宿主半区 `src/index.ts` 只做编配：注册官方 `tools/pre-execute` 监听（命令执行前、
  带解析参数）、loopback 路由与设置命名空间；`src/pre-execute.ts` 是判定门，
  `src/judge-client.ts` 直连可配置的 OpenAI 兼容端点做模型判定。
- `src/routes.ts` 的所有路由必须 loopback-only。
- 浏览器半区只做 type-only 的 `@deepseek-ai/*` 导入；芯片注入
  `conversation.input.left` 工具行槽位，弹层经 portal 渲染并支持 click-outside。
- 默认不注入 agent 公告（`announceToAgent` 默认 `false`，issue #839）。
- 给 agent 的判定是执行前的建议性过滤器，绝不是 OS 沙箱；DSH 沙箱仍是安全边界。
- 构建预设 `build/tsdown.client.ts` + `build/web-platform.ts` 是从 dsh-web 仓库
  vendor 进来的副本，升级 dsh-web 时同步更新。

## 提交前检查

```sh
pnpm typecheck
pnpm test
pnpm build
```