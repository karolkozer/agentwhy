import type { Agent } from './agent.ts';
import type { CapabilityRecord } from './capability.ts';
import type { Completeness, Gap } from './completeness.ts';
import type { ContextRecord, ModelDelivery } from './context.ts';
import type { Delegation } from './delegation.ts';
import type { ToolEvent } from './event.ts';
import type { AgentMessage } from './message.ts';
import type { ProjectRoot } from './project-root.ts';
import type { Review } from './review.ts';
import type { Provider } from './session-format.ts';
import type { Turn } from './turn.ts';

/**
 * One session as the core sees it: who acted, what started them, what they attempted, and what is missing. No
 * provider's field names reach this far - the adapter maps them to these terms, so a second adapter changes no
 * logic and `guard` evaluates the same model `report` does (spec §9).
 *
 * Every collection is present, empty where a format records nothing of its kind: an adapter says "none", never
 * nothing, so an omitted collection cannot pass for a complete one (`2026-09-27-what-codex-wrote.md` §4.G).
 */
export interface SessionModel {
  readonly sessionId: string;
  /** Which AI wrote the session (`2026-09-27-what-codex-wrote.md` X28): what the report says it is a record of. */
  readonly provider: Provider;
  /** The directory this session ran in, which displayed paths are shown relative to. Read, never inferred. */
  readonly projectRoot: ProjectRoot;
  readonly agents: readonly Agent[];
  readonly delegations: readonly Delegation[];
  readonly events: readonly ToolEvent[];
  /** What each agent wrote, beside what it called - where a delegated agent's report is (`2026-09-15-what-came-back.md` R1). */
  readonly messages: readonly AgentMessage[];
  /** Each agent's turns, where the format records them by id. */
  readonly turns: readonly Turn[];
  /** What reviewers the runtime started decided, each on a turn - never on a call, and never a delegation. */
  readonly reviews: readonly Review[];
  /** Content that is no call, result or own words: code an agent wrote, words it was given, and what joins nothing. */
  readonly contexts: readonly ContextRecord[];
  /** Content an agent's model received that is not the result of one of its calls. */
  readonly deliveries: readonly ModelDelivery[];
  /** Which questions the format answers for each source, where the adapter declares it. */
  readonly capabilities: readonly CapabilityRecord[];
  /** Everything that could not be established, each named. Empty means the picture is whole. */
  readonly gaps: readonly Gap[];
  readonly completeness: Completeness;
}
