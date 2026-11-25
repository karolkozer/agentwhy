import { PASSIVE_RECORD_TYPES, RECORD_KEYS, RECORD_TYPES } from '../contract/envelope.js';
const KNOWN_TYPES = new Set([...Object.values(RECORD_TYPES), ...PASSIVE_RECORD_TYPES]);
/**
 * Whether a record is of a shape the contract measured (CPD13): a type it lists - read, or passive - and no key at the
 * record's own level beyond the envelope's. One rule for the reader and `doctor`, so the two never disagree about which
 * file is measured.
 */
export function knownRecordType(type) {
    return typeof type === 'string' && KNOWN_TYPES.has(type);
}
export function unknownRecordKeys(record) {
    return Object.keys(record).filter((key) => !RECORD_KEYS.includes(key)).length;
}
