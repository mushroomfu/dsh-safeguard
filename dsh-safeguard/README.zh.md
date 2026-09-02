# dsh-safeguard

[English](README.md) | 中文

DSH Web GUI 插件：Codex 风格的命令权限守卫。在每条 shell 命令真正执行前，先判断它是否
**危险**、是否**多余**，据此自动「拒绝 / 跳过 / 放行」；规则覆盖不到的命令再交给可配置的
**模型判定**。控制入口是一个模式开关芯片，挂在输入框工具行（紧挨权限/接入模式选择器）。

## 是什么

- **两级判定。** 第一级是确定性规则：免费且零成本地拦截明显危险的命令
  （`rm -rf /`、把远端内容管道进 shell、`git push --force`）和明显多余的无操作命令
  （`echo`、`true`、纯注释）。规则没把握的命令交给可选的模型判定（模型只回答一段紧凑的
  JSON）。
- **四种模式。** `off`（不干预）、`observe`（只记录不干预）、`assist` / `auto`（危险命令
  拒绝、多余命令跳过、其余照常放行；沙箱继续兜底，不新增弹窗）。
- **模式开关芯片。** 挂在 `conversation.input.left`（输入框工具行、紧挨权限选择器），显示
  当前模式、切换模式、列出最近判定；点击页面其它位置自动收起。
- **沙箱兜底。** 守卫只对「危险 / 多余」两类做快速拦截，其余命令仍走 DSH 沙箱与官方审批；
  它既不新增弹窗，也不替代沙箱。

## 设计 / 工作原理

借鉴 Codex 的权限判定思想：把「能不能跑」拆成**风险**和**必要性**两个独立维度。

```text
命令 -> 确定性规则(危险/无操作) -> 有结论? -----> 判定
                 | 无结论                          |
                 v                                 v
            模型判定(JSON) -> 无结论 -> 放行交给沙箱
                                                     |
                                     判定 -> 放行 | 拒绝 | 跳过
```

- 判定结果 `{ danger, necessary, reason }` 是纯数据，由 `src/core/classify.ts`（规则）与
  `src/core/policy.ts`（策略）共享，宿主两侧与测试都复用同一份逻辑。
- 宿主半区 `src/index.ts` 注册官方 **`tools/pre-execute`** 监听——命令派发前、带着已解析
  参数回调，据此返回 `allow` / `deny` / `ask`（`ask` 交给官方审批 UI）。
- 模型判定 `src/judge-client.ts` 直连可配置的 OpenAI 兼容端点（拒绝重定向、密钥读环境变量、
  响应体封顶），与家族 describe-image 工具同款做法。
- 浏览器半区 `src/client/index.ts` 把芯片注入 `conversation.input.left`；弹层经 portal 渲染到
  `document.body`、向上展开、置于最高图层，支持 click-outside 关闭。

## 安装

### 从 npm 安装（推荐）

```sh
dsh plugin --profile desktop add dsh-safeguard@latest
```

### 从仓库安装（开发调试）

```sh
git clone https://github.com/mushroomfu/dsh-safeguard.git
cd dsh-safeguard/dsh-safeguard
pnpm install
pnpm build
dsh plugin --profile desktop add link:$(pwd)
```

安装后重启 DSH Desktop 生效。若用开发版 `dsh web`，把命令里的 `--profile desktop` 换成
`--profile web`。

## 配置

| 键 | 默认 | 含义 |
| --- | --- | --- |
| `enabled` | `true` | 总开关；关闭后守卫不干预。 |
| `mode` | `observe` | `off` / `observe` / `assist` / `auto`。 |
| `judgeApiBase` | `""` | 模型判定的 OpenAI 兼容 base URL；留空关闭模型判定（只用确定性规则）。 |
| `judgeModel` | `""` | 模型判定端点使用的模型 id。 |
| `judgeApiKeyEnv` | `""` | 存放判定端点 bearer 密钥的环境变量名；留空不发送 Authorization 头。 |
| `announceToAgent` | `false` | 是否向 agent 注入插件公告（默认关，保持提示词干净）。 |

在 profile 的 `cordis.patch.yml` 里以 id-targeted config 覆写（也可由 bundle 自带的
`cordis.patch.yml` 提供默认）：

```yaml
- id: ui-safeguard
  config:
    mode: assist
    judgeApiBase: http://127.0.0.1:10008/v1
    judgeModel: zenmux/deepseek/deepseek-v4-flash
```

`mode` 也可用芯片实时切换，改动立即生效，无需重启。

## 安全模型

- 守卫是一层**执行前的建议性过滤器**，不是操作系统沙箱；DSH 自带的权限预设
  （`read-only` / `workspace-write` / `danger-full-access`）仍是真正的安全边界。
- 宿主 API（`/api/command-guard/*`）**仅限 loopback**：这些路由会改变命令被放行的激进程度，
  暴露到局域网的部署不得把它们服务给远端浏览器。
- 模型判定直连可配置端点：拒绝重定向、密钥只读环境变量、响应体封顶；判定失败时不额外放行
  危险命令，剩余命令照常交给沙箱与官方审批。

## 已知限制

- 确定性规则只覆盖固定的「危险 / 无操作」清单；清单外的命令要么交模型判定，要么照常放行交给
  沙箱（取决于是否配置 `judgeApiBase`）。
- `rm -rf /tmp/xxx` 会被 `rm -rf /` 前缀误判成「危险」；后续可改为精确正则区分根目录 `/` 与
  `/tmp`。
- 「最近判定」流只存内存，是 UI 表面，不是持久化审计日志。

## 许可证

BSD-3-Clause。