const JSON_INDENT = 2;
/** Either provider's closed report, as JSON: its schema is its type, and nothing else is written. */
export class JsonDoctorRenderer {
    render(report) {
        return `${JSON.stringify(report, null, JSON_INDENT)}\n`;
    }
}
