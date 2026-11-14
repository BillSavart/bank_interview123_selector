export const voterVerificationNeeded = 'voter-verification-needed';
let pending: Promise<boolean> | null = null;
let finish: ((verified: boolean) => void) | null = null;

export function finishVoterVerification(verified: boolean) {
  finish?.(verified);
}

function requestVoterVerification(): Promise<boolean> {
  if (pending) return pending;
  pending = new Promise<boolean>((resolve) => { finish = resolve; }).finally(() => {
    pending = null;
    finish = null;
  });
  window.dispatchEvent(new Event(voterVerificationNeeded));
  return pending;
}

export async function voterWrite(path: string, body: object): Promise<Response> {
  const send = () => fetch(path, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const response = await send();
  if (response.status !== 403 || !await requestVoterVerification()) return response;
  return send();
}
