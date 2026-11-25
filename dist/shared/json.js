export function isJsonObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/** Parses text that should hold a JSON object. Invalid JSON and any other JSON value yield undefined. */
export function parseJsonObject(text) {
    try {
        const value = JSON.parse(text);
        return isJsonObject(value) ? value : undefined;
    }
    catch {
        return undefined;
    }
}
