import { useEffect, useRef, useState } from 'react';
import { finishVoterVerification, voterVerificationNeeded } from '../lib/voterSession';
import { TurnstileWidget, type TurnstileChallenge } from './TurnstileWidget';

export function VoterVerification() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [challenge, setChallenge] = useState<TurnstileChallenge>({ required: null, token: '' });
  const [reset, setReset] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const show = () => {
      setChallenge({ required: null, token: '' });
      setError('');
      setReset(0);
      setOpen(true);
      dialog.current?.showModal();
    };
    window.addEventListener(voterVerificationNeeded, show);
    return () => window.removeEventListener(voterVerificationNeeded, show);
  }, []);

  const close = (verified: boolean) => {
    finishVoterVerification(verified);
    setOpen(false);
    dialog.current?.close();
  };

  const verify = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/voter-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turnstileToken: challenge.token }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error || '安全驗證失敗，請再試一次。');
      }
      close(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : '安全驗證失敗，請再試一次。');
      setReset((value) => value + 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={dialog}
      aria-labelledby="voter-verification-title"
      className="border-0 rounded-3 p-4"
      onCancel={(event) => { event.preventDefault(); if (!busy) close(false); }}
    >
      {open && (
        <form onSubmit={verify}>
          <h2 className="h5" id="voter-verification-title">評分與投票驗證</h2>
          <TurnstileWidget action="voter-enroll" challenge={challenge} onChange={setChallenge} resetKey={reset} />
          {error && <p className="text-danger" role="alert">{error}</p>}
          <div className="d-flex gap-2 mt-3">
            <button type="submit" className="btn btn-primary" disabled={busy || challenge.required === null || (!!challenge.required && !challenge.token)}>
              繼續
            </button>
            <button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={() => close(false)}>取消</button>
          </div>
        </form>
      )}
    </dialog>
  );
}
