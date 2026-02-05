type CallbackPayload = {
  event: string;
  requestId: string;
  status: string;
  humanId?: string | null;
};

export async function notifyCallback(url: string, payload: CallbackPayload) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    console.warn('Callback notify failed', error);
  } finally {
    clearTimeout(timeout);
  }
}
