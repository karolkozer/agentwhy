// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { parseJsonObject } from '../../../shared/json.js';
import { META_FIELD } from '../contract/fields.js';
export function readDelegationIndex(text) {
    const meta = parseJsonObject(text);
    if (meta === undefined)
        return undefined;
    const callId = meta[META_FIELD.toolUseId];
    const requestedType = meta[META_FIELD.agentType];
    const depth = meta[META_FIELD.spawnDepth];
    return {
        ...(typeof callId === 'string' ? { callId } : {}),
        ...(typeof requestedType === 'string' ? { requestedType } : {}),
        ...(typeof depth === 'number' ? { depth } : {}),
    };
}
