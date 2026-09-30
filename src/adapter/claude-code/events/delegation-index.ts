import { parseJsonObject } from '../../../shared/json.ts';
import { META_FIELD } from '../contract/fields.ts';

/** One meta.json, read as found. A field that is absent or of the wrong type stays absent - it is never filled in. */
export interface ScannedIndexEntry {
  readonly callId?: string;
  readonly requestedType?: string;
  readonly depth?: number;
}

export function readDelegationIndex(text: string): ScannedIndexEntry | undefined {
  const meta = parseJsonObject(text);
  if (meta === undefined) return undefined;

  const callId = meta[META_FIELD.toolUseId];
  const requestedType = meta[META_FIELD.agentType];
  const depth = meta[META_FIELD.spawnDepth];

  return {
    ...(typeof callId === 'string' ? { callId } : {}),
    ...(typeof requestedType === 'string' ? { requestedType } : {}),
    ...(typeof depth === 'number' ? { depth } : {}),
  };
}
