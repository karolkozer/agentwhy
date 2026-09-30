/**
 * Where a project keeps Claude Code settings, and how hooks are written in them (`specs/2026-09-16-worth-running-every-day.md`
 * R4-R8). **Documented, not measured** against this project's oracle: read from the settings and hooks references.
 */
export const SETTINGS_FILES = {
  directory: '.claude',
  /** Shared with everyone who clones the project. `init` reads deny rules here and never writes. */
  shared: 'settings.json',
  /** One person's, kept out of the repository by Claude Code. The only file `init` writes. */
  local: 'settings.local.json',
} as const;

export const HOOK_SETTINGS = {
  hooks: 'hooks',
  /** One entry of an event's list: an optional matcher, and the commands it runs. */
  matcher: 'matcher',
  commands: 'hooks',
  type: 'type',
  commandType: 'command',
  command: 'command',
  /** The variable a hook command is expanded with, naming the project it runs for. */
  projectDirectory: '$CLAUDE_PROJECT_DIR',
} as const;

/** Where a settings file keeps the rules that refuse a tool call (`specs/2026-09-13-agentwhy-spec.md` §6.1). */
export const PERMISSIONS = {
  permissions: 'permissions',
  deny: 'deny',
} as const;
