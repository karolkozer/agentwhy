// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * Which model a reply came from (contract v18, `.ai/specs/2026-11-15-which-model-it-ran-on.md` MR1).
 *
 * Measured 2026-11-15 over 387 main transcripts and 186 subagent transcripts on the maintainer's machine, counted as
 * values and never as content: every `assistant` line carries `model` on its `message`, always a string - an id such as
 * `claude-opus-5-5` on all but 63 of them, and `<synthetic>` on those 63, lines Claude Code wrote itself, which name no
 * model. A subagent's transcript names its own model, which can differ from the main transcript's; 18 of 186 name more
 * than one value, and 14 of 387 main transcripts name more than one id (a model changed during the conversation).
 */
export const MESSAGE_MODEL_FIELD = 'model';

/**
 * What a model id looks like: letters, digits and `.` `:` `@` `/` `-`, at most 128 characters. Every value measured
 * that names a model has this shape; `<synthetic>` does not, and neither does the marker the redacted corpus wrote in
 * the field's place - so a value of another shape is no model id, and is never shown as one.
 */
export const MODEL_ID_SHAPE = /^[A-Za-z0-9][A-Za-z0-9.:@/-]{0,127}$/;
