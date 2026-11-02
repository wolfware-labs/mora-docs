import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';

interface Props {
  action: string;
}

type State = 'idle' | 'sending' | 'done' | 'failed';

const input: CSSProperties = {
  flex: '1 1 220px',
  minHeight: 48,
  padding: '0 14px',
  borderRadius: 10,
  border: '1px solid #4A3340',
  background: '#0D0709',
  color: '#F6EFE9',
  font: 'inherit',
};

const button: CSSProperties = {
  minHeight: 48,
  padding: '0 22px',
  borderRadius: 10,
  border: 0,
  background: '#F39C3D',
  color: '#1A0E12',
  font: 'inherit',
  fontWeight: 600,
  cursor: 'pointer',
};

/**
 * A plain form that posts to MailerLite and works without JavaScript. Once
 * hydrated it submits with fetch instead, so the result shows inline.
 */
export default function Newsletter({ action }: Props) {
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<State>('idle');

  useEffect(() => setReady(true), []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === 'sending') return;
    const form = event.currentTarget;
    setState('sending');
    let result: { success?: boolean };
    try {
      const response = await fetch(action, {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        // A definite rejection from the server: say so and keep the address.
        setState('failed');
        return;
      }
      result = (await response.json()) as { success?: boolean };
    } catch {
      // Blocked by CORS, offline, or a reply we cannot read. The signup may still
      // have gone through, so let the browser submit the form the plain way.
      form.submit();
      return;
    }
    setState(result.success === true ? 'done' : 'failed');
  }

  const message =
    state === 'done'
      ? 'Check your inbox to confirm your subscription.'
      : state === 'failed'
        ? "That didn't go through. Try again in a minute."
        : 'One email per release. Unsubscribe from any email.';

  return (
    <form action={action} method="post" onSubmit={onSubmit} data-ready={ready ? '' : undefined} data-state={state}>
      <label htmlFor="newsletter-email" style={{ display: 'block', fontWeight: 600, marginBottom: 10 }}>
        Email
      </label>
      <input type="hidden" name="ml-submit" value="1" />
      <input type="hidden" name="anticsrf" value="true" />
      {state !== 'done' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <input
            id="newsletter-email"
            name="fields[email]"
            type="email"
            required
            placeholder="you@example.com"
            autoComplete="email"
            style={input}
          />
          <button type="submit" disabled={state === 'sending'} style={button}>
            Notify me
          </button>
        </div>
      )}
      <p aria-live="polite" style={{ margin: '12px 0 0', fontSize: 14, color: state === 'failed' ? '#FF8C78' : '#9A8892' }}>
        {message}
      </p>
    </form>
  );
}
