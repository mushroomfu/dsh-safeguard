/**
 * Deterministic command classifier: the fast, free, always-available first
 * pass. It catches obviously dangerous commands and obviously redundant
 * no-ops, and returns `undefined` for anything ambiguous so the host can fall
 * back to the model judge. Pure and side-effect free; unit-tested.
 */

import type { CommandContext, Verdict } from './types.ts'

/** Lowercased command stem of a shell line (first non-comment token). */
function stem(line: string): string {
  const cleaned = line.trim().replace(/^!\s*/, '')
  if (cleaned === '') return ''
  const token = /([^\s;&|]+)/.exec(cleaned)?.[1] ?? ''
  return token.toLowerCase()
}

/** Normalized line with comments, surrounding whitespace and shell noise stripped. */
function normalize(line: string): string {
  return line
    .split('\n')
    .map(part => part.replace(/#.*$/, '').trim())
    .filter(part => part !== '')
    .join(' ; ')
    .trim()
}

/** Only commands with no useful side effect and no task-relevant output. */
const NOOP_STEMS = new Set(['echo', 'true', 'false', ':'])

/** Commands whose execution is essentially a no-op (screen/state helpers). */
const NOOP_MARKERS = ['clear', 'cls', 'history']

/** Definitely destructive: deny without asking regardless of mode. */
const DANGEROUS_MARKERS = [
  'rm -rf /', 'rm -rf /*', 'rm -fr /', 'rm -rf ~', 'rm -rf $home',
  'mkfs', 'fdisk', 'diskpart', 'format c:', 'format d:',
  'dd if=', 'dd of=/dev/', ':(){ :|:& };:', 'forkbomb',
  '> /dev/sda', '> /dev/sdb', '> /dev/nvme',
  'chmod -r 777 /', 'chmod 777 /', 'chown -r root:root /',
  'shutdown', 'poweroff', 'reboot', 'halt',
  'drop database', 'drop table', 'truncate table', 'delete from',
  'git push --force', 'git push -f', 'git reset --hard', 'git clean -fdx',
  'del /f /s', 'rd /s /q', 'rmdir /s /q',
]

/** Destructive/remote/privilege-escalating: deny in auto, ask in assist. */
const RISKY_MARKERS = [
  'rm ', 'rmdir', 'del ', 'rd ',
  'mv ', 'move ',
  'chmod ', 'chown ', 'icacls', 'cacls', 'attrib',
  'sudo ', 'su ', 'runas',
  'kill ', 'killall', 'pkill', 'taskkill', 'stop-process',
  'git push', 'git commit', 'git rebase', 'git reset ', 'git checkout --',
  'npm install -g', 'npm i -g', 'pnpm add -g', 'yarn global', 'pip install', 'pip3 install', 'gem install', 'cargo install',
  'apt ', 'apt-get ', 'yum ', 'dnf ', 'pacman ', 'brew ', 'choco ', 'winget ',
  'systemctl ', 'service ', 'launchctl ', 'sc ', 'net ',
  'docker ', 'kubectl ', 'helm ', 'podman ',
  'curl ', 'wget ', 'scp ', 'rsync ', 'ssh ', 'ftp ', 'nc ', 'netcat ', 'telnet ',
  'mount ', 'umount', 'mkfs', 'fsck',
  'cryptsetup', 'openssl ', 'htpasswd',
]

/** High-risk pipe chains: remote content straight into a shell. */
const PIPE_EXEC = /(\bcurl\b|\bwget\b).*\|\s*(ba)?sh\b/

/**
 * Classify one command deterministically. Returns undefined when the rule
 * layer has no opinion (caller falls back to the model judge).
 */
export function classifyCommand(ctx: CommandContext): Verdict | undefined {
  const line = normalize(ctx.command)
  if (line === '') {
    return { danger: 'safe', necessary: false, reason: 'empty command', source: 'rule' }
  }

  const s = stem(ctx.command)
  if (s === '') {
    return { danger: 'safe', necessary: false, reason: 'comment-only command', source: 'rule' }
  }

  // Pure no-ops: recognized stems with no redirect/write suffix.
  const hasRedirect = /[<>|]/.test(line)
  if (NOOP_STEMS.has(s) && !hasRedirect) {
    return { danger: 'safe', necessary: false, reason: `no-op command (${s})`, source: 'rule' }
  }
  if (NOOP_MARKERS.some(marker => s.startsWith(marker)) && !hasRedirect) {
    return { danger: 'safe', necessary: false, reason: `informational no-op (${s})`, source: 'rule' }
  }

  // Remote-content pipe execution is the most dangerous everyday pattern.
  if (PIPE_EXEC.test(line)) {
    return { danger: 'dangerous', necessary: true, reason: 'remote content piped into a shell', source: 'rule' }
  }

  const lowered = line.toLowerCase()

  // Explicit destructive markers win first.
  for (const marker of DANGEROUS_MARKERS) {
    if (lowered.includes(marker)) {
      return { danger: 'dangerous', necessary: true, reason: 'destructive system command', source: 'rule' }
    }
  }

  // Risk markers are ordered: more specific (sudo, package managers) before
  // generic prefixes is not needed because we only need the first hit, but a
  // generic `rm` must still be outranked by the dangerous variants above.
  for (const marker of RISKY_MARKERS) {
    if (lowered.includes(marker)) {
      return { danger: 'risky', necessary: true, reason: `mutating or privileged command (${safeName(marker)})`, source: 'rule' }
    }
  }

  // Safe read-only commands: only when the line looks at most like a read +
  // a few flags; keep the allow-list tight so unknown commands stay ambiguous.
  if (isReadOnly(s, line)) {
    return { danger: 'safe', necessary: true, reason: 'read-only command', source: 'rule' }
  }

  return undefined
}

export const READ_ONLY_STEMS = new Set([
  'ls', 'dir', 'cat', 'head', 'tail', 'less', 'more', 'grep', 'find', 'locate',
  'which', 'where', 'whereis', 'type', 'git status', 'git log', 'git diff', 'git show', 'git branch', 'git remote',
  'npm ls', 'npm view', 'npm outdated', 'pnpm list', 'pnpm why', 'node -v', 'node --version',
  'node -p', 'python --version', 'python3 --version', 'go version', 'rustc --version', 'java -version',
])

/** Read-only check with a guard: no redirection and a recognized stem. */
function isReadOnly(s: string, line: string): boolean {
  if (/[<>|]/.test(line)) return false
  if (/\b(sudo|su)\b/.test(line)) return false
  return READ_ONLY_STEMS.has(s) || [...READ_ONLY_STEMS].some(prefix => s.startsWith(`${prefix} `) || line.toLowerCase().startsWith(prefix))
}

/** Short, marker-only name for a risk reason (strip trailing space). */
function safeName(marker: string): string {
  return marker.trim()
}