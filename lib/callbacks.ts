// Polling is the supported delivery mechanism until a durable, signed egress worker exists.
// Disabling legacy callback records also closes the outbound SSRF boundary.
export async function notifyCallback(_url: string, _payload: unknown) { return; }
