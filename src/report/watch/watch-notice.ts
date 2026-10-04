// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
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
  | { readonly kind: 'not-checked'; readonly reason: NotChecked }
  /**
   * A finished helper that kept no record, so there was nothing to check (`when-an-agent-finishes.md` R4a). Said once
   * a session, in the person's language: what reaches them in the Claude desktop app is often this and nothing else.
   */
  | { readonly kind: 'no-record'; readonly lang: NoticeLang }
  /**
   * The conversation read private files, and what they held is in it (`the-chat-says-what-the-report-says.md` S1, S8,
   * §5): said in agentwhy's voice, in the person's language, by what the files held - keys, a template, private data -
   * or as a read the person allowed (`told`, F57), which asks for nothing.
   */
  | { readonly kind: 'told'; readonly lang: NoticeLang }
  | { readonly kind: 'read'; readonly what: ReadKind; readonly lang: NoticeLang };

/**
 * What a private file the conversation read held, as the report's to-do list says it (S1): keys to change, a template
 * whose value may be one, or private data that cannot be changed.
 */
export type ReadKind = 'keys' | 'template' | 'data';
