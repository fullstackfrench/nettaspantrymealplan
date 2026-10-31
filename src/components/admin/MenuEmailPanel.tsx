'use client';

import { useRef, useState } from 'react';
import Dialog from '@/components/ui/Dialog';
import { previewMenuEmail, sendMenuTestEmail } from '@/app/admin/menus/email-actions';
import type { MenuEmailPreview } from '@/lib/email/menu-announcement';

export default function MenuEmailPanel({ menuId, resendConfigured }: { menuId: string; resendConfigured: boolean }) {
  const [preview, setPreview] = useState<MenuEmailPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const busy = useRef(false);
  const requestId = useRef<string | null>(null);

  function closePreview() {
    if (busy.current) return;
    setPreview(null);
    setError(null);
  }

  async function openPreview() {
    if (busy.current) return;
    busy.current = true;
    setLoading(true); setError(null); setNotice(null);
    try {
      const result = await previewMenuEmail(menuId);
      if (result.preview) setPreview(result.preview);
      else setError(result.error ?? 'Unable to preview this email.');
    } catch {
      setError('Unable to reach the server. Please try again.');
    } finally { busy.current = false; setLoading(false); }
  }

  async function sendTest() {
    if (busy.current) return;
    busy.current = true;
    setSending(true); setError(null); setNotice(null);
    try {
      requestId.current ??= crypto.randomUUID();
      const result = await sendMenuTestEmail(menuId, requestId.current);
      if (result.sent) {
        setNotice(`Resend accepted the test for ${result.to}. Check your inbox and spam folder.`);
        requestId.current = null;
      } else setError(result.error ?? 'Unable to send this test. Please retry.');
    } catch {
      setError('Unable to confirm the send. Retry to check the same test without sending a duplicate.');
    } finally { busy.current = false; setSending(false); }
  }

  return (
    <section aria-label="Menu announcement email" className="admin-card mt-5 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-bold text-brand-plum">Menu announcement</h3>
          <p className="mt-1 text-sm text-ink/60">Preview this week’s email and send a test to your administrator inbox. Customer sending is not enabled yet.</p>
        </div>
        <button type="button" aria-disabled={loading} onClick={openPreview} aria-haspopup="dialog" className="admin-secondary-button shrink-0 aria-disabled:opacity-50">
          {loading ? 'Loading preview…' : 'Preview menu email'}
        </button>
      </div>
      {!preview && error && <p role="alert" className="mt-3 text-sm text-brand-brick">{error}</p>}
      {preview && (
        <Dialog titleId="menu-email-preview-title" onClose={closePreview}>
          <header className="flex shrink-0 items-start justify-between gap-4 border-b border-brand-plum/10 px-5 py-4">
            <div>
              <h2 id="menu-email-preview-title" className="font-display text-xl font-bold text-brand-plum">Menu email preview</h2>
              <p className="mt-1 text-sm text-ink/60">{preview.mealCount} dishes · {preview.draft ? 'Draft menu' : 'Published menu'} · Test only</p>
            </div>
            <button type="button" aria-disabled={sending} onClick={closePreview} aria-label="Close email preview" className="admin-quiet-action aria-disabled:opacity-50">Close</button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <p className="mb-3 text-sm text-ink/70"><strong>Subject:</strong> [TEST] {preview.subject}</p>
            <iframe title="Menu announcement email content" srcDoc={preview.html} sandbox="" className="h-[50dvh] min-h-[260px] w-full rounded-control border border-brand-plum/10" />
            {error && <p role="alert" className="mt-3 rounded-control bg-clay-100 p-3 text-sm text-brand-brick">{error}</p>}
            {notice && <p role="status" className="mt-3 rounded-control bg-moss-50 p-3 text-sm text-moss-700">{notice}</p>}
            {!resendConfigured && <p className="mt-3 text-sm text-ink/60">Resend isn’t configured in this environment. The preview works; test sending will be available where RESEND_API_KEY is configured.</p>}
          </div>
          <footer className="shrink-0 border-t border-brand-plum/10 px-5 py-4">
            <button type="button" onClick={sendTest} disabled={!resendConfigured} aria-disabled={sending} className="admin-primary-button w-full disabled:opacity-50 aria-disabled:opacity-50 sm:w-auto">
              {sending ? 'Sending test…' : 'Send test to my inbox'}
            </button>
          </footer>
        </Dialog>
      )}
    </section>
  );
}
