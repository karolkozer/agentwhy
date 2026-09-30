import type { RememberedAlert, SessionCounts } from '../../ports/alert-store.ts';
import type { AgentAlert } from './agent-alert.ts';
import type { NoticeLang } from './notice-choices.ts';

/** Why a finished agent was not checked. Each is said, never skipped (`specs/2026-09-16-when-an-agent-finishes.md` R4, R8). */
export type NotChecked = 'arguments' | 'input' | 'policy' | 'session' | 'agent-not-found';

/**
 * What one run of `watch` has to say: an alert about the agent that just finished, everything a turn remembered,
 * nothing, or that it could not look.
 */
export type WatchNotice =
  | { readonly kind: 'alert'; readonly alert: AgentAlert }
  /** At `Stop`: what the turn's finished agents left behind (`a-notice-in-the-conversation.md` R6). */
  | { readonly kind: 'turn'; readonly remembered: readonly RememberedAlert[] }
  /**
   * At `Stop`, with nothing found this turn and a person who asked to hear that (`the-agent-tells-you.md` R4-R6).
   * `first` is the line that says a session is being watched, said once; `counts` is what earlier turns of this
   * session found, so a quiet turn is never reported as a quiet session. `lang` is the language it is said in (R29).
   */
  | { readonly kind: 'clean'; readonly first: boolean; readonly counts: SessionCounts; readonly lang: NoticeLang }
  /**
   * The person's notification choices could not be read, so the built-in ones are in force (R24). Said once a
   * session and on a turn with nothing else to say: a finding always comes first, and this is about the channel.
   */
  | { readonly kind: 'preferences-unusable' }
  | { readonly kind: 'quiet' }
  | { readonly kind: 'not-checked'; readonly reason: NotChecked };
