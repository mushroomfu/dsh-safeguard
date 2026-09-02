# dsh-safeguard

English | [中文](README.zh.md)

A DSH Web GUI plugin that adds a Codex-style command permission guard. Before a
shell command runs, the guard judges whether it is dangerous and whether it is
necessary, then denies, skips, or allows it accordingly; commands the rules
cannot classify go to an optional model judge. The control is a mode-switch chip
in the composer tool row, right beside the permission / access-mode selector.

## What it does

- **Two-stage judgment.** A deterministic rule pass catches obviously dangerous
  commands (`rm -rf /`, remote content piped into a shell, `git push --force`)
  and obvious no-ops (`echo`, `true`, comments) for free. Ambiguous commands
  fall through to an optional model judge that answers a compact JSON prompt.
- **Four run modes.** `off` (never intervene), `observe` (record only), and
  `assist` / `auto` (deny dangerous, skip redundant, allow the rest under the
  sandbox — the guard never adds an approval prompt).
- **Mode-switch chip.** A chip in `conversation.input.left` (the tool row, beside
  the permission control) shows the active mode, switches it, and lists recent
  verdicts; clicking elsewhere closes the popover.
- **Sandbox-backed.** The guard only short-circuits dangerous and redundant
  commands; everything else still runs under the DSH sandbox and official
  approval flow. It neither adds prompts nor replaces the sandbox.

## Design

Codex-style permission judgment, split into two independent axes: danger and
necessity.

```text
command -> deterministic rules (dangerous/no-op) -> known? ----> verdict
                  | unknown                                  |
                  v                                          v
             model judge (JSON) -> unknown -> allow under sandbox
                                                                 |
                                      verdict -> allow | deny | skip
```

- `{ danger, necessary, reason }` is pure data shared by `src/core/classify.ts`
  (rules) and `src/core/policy.ts` (policy), reused by both halves and the tests.
- The host half `src/index.ts` subscribes to the official `tools/pre-execute`
  event — fired before dispatch with the parsed arguments — and returns
  `allow` / `deny` / `ask` (`ask` delegates to the official approval UI).
- The model judge `src/judge-client.ts` calls a configurable OpenAI-compatible
  endpoint directly (redirects refused, key from an env var, body bounded),
  matching the family's describe-image tool.
- The browser half `src/client/index.ts` mounts the chip into
  `conversation.input.left`; the popover renders through a portal into
  `document.body`, expands upward, sits on the top layer, and supports
  click-outside-to-close.

## Install

### From npm (recommended)

```sh
dsh plugin --profile desktop add dsh-safeguard@latest
```

### From the repository (development)

```sh
git clone https://github.com/mushroomfu/dsh-safeguard.git
cd dsh-safeguard
pnpm install
pnpm build
dsh plugin --profile desktop add link:$(pwd)
```

Restart DSH Desktop after installing. For the development `dsh web` profile,
replace `--profile desktop` with `--profile web`.

## Config

| key | default | meaning |
| --- | --- | --- |
| `enabled` | `true` | Master switch. When false, the guard does not intervene. |
| `mode` | `observe` | `off` / `observe` / `assist` / `auto`. |
| `judgeApiBase` | `""` | OpenAI-compatible base URL for the model judge; empty disables it (deterministic rules only). |
| `judgeModel` | `""` | Model id the judge endpoint runs. |
| `judgeApiKeyEnv` | `""` | Env var holding the judge endpoint bearer key; empty sends no Authorization header. |
| `announceToAgent` | `false` | Opt-in agent-facing announcement (kept off to keep prompts clean). |

Override in the profile's `cordis.patch.yml` as an id-targeted config (or ship a
default on the bundle's own `cordis.patch.yml`):

```yaml
- id: ui-safeguard
  config:
    mode: assist
    judgeApiBase: http://127.0.0.1:10008/v1
    judgeModel: zenmux/deepseek/deepseek-v4-flash
```

The `mode` is also switchable live from the chip, effective immediately.

## Security model

- The guard is an **advisory pre-execution filter**, not an OS sandbox; the DSH
  permission presets (`read-only`, `workspace-write`,
  `danger-full-access`) remain the real security boundary.
- The host API surface (`/api/command-guard/*`) is **loopback-only**: these
  routes change how eagerly commands run, so a LAN-exposed deployment must not
  serve them remotely.
- The model judge calls a configurable endpoint directly: redirects refused, key
  read only from an env var, response body bounded. On a failed judgment the
  guard does not additionally allow dangerous commands; remaining commands still
  run under the sandbox and official approval flow.

## Known limitations

- The deterministic layer only covers a fixed dangerous / no-op list. Unlisted
  commands go to the model judge when configured, otherwise to the sandbox.
- `rm -rf /tmp/xxx` is scrambled as dangerous by the `rm -rf /` prefix; a precise
  regex distinguishing root `/` from `/tmp` is a later refinement.
- The recent-decision feed is in-memory only; it is UI surface, not a durable
  audit log.

## License

BSD-3-Clause.