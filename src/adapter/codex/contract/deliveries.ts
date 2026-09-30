/**
 * What the model is handed (XB5, §2.8). The model writes JavaScript into the `exec` tool; the cell's own output,
 * `custom_tool_call_output.output`, is the one thing of it the model receives - a string, or parts whose text is under
 * `input_text` - and it joins its cell by `call_id` (1,250 of 1,250; 17 of 17). No id joins it to the items the cell's
 * code produced, so what it carries is attributed to no action (X10, X14).
 *
 * A direct call is a `function_call`, joined to its `function_call_output` by `call_id` (88 of 88, §2.3); where an item's
 * `id` equals that `call_id` (59 `McpToolCall` items), the item is the action and the output its delivery.
 */
export const CODE_CELL = {
  tool: 'exec',
  name: 'name',
  code: 'input',
  callId: 'call_id',
  output: 'output',
  partType: 'type',
  partText: 'text',
  textPart: 'input_text',
} as const;

export const FUNCTION_CALL = {
  name: 'name',
  callId: 'call_id',
  arguments: 'arguments',
  output: 'output',
} as const;
