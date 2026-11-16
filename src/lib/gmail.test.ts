import { describe, it, expect, vi, afterEach } from 'vitest';
import { checkGmailIdentity, gmailMime, gmailToken, sendGmail } from './gmail';
import { prisma } from './prisma';
import type { EmailMessage } from '@prisma/client';
vi.mock('./prisma', () => ({ prisma: { emailMessage: { findUnique: vi.fn() } } }));
const message = { id: 'test-id', sender: 'Afiq Amri <afiqamri03@gmail.com>', recipient: 'business@example.com', replyTo: 'afiqamri03@gmail.com', subject: 'Hello Café', body: 'A thoughtful introduction.', unsubscribeUrl: 'https://workspace.test/unsubscribe?token=test' } as EmailMessage;
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe('Gmail transport', () => {
  it('encodes UTF-8 MIME and includes the real sender and opt-out headers', () => {
    const raw = Buffer.from(gmailMime(message), 'base64url').toString();
    expect(raw).toContain('<afiqamri03@gmail.com>'); expect(raw).toContain('Reply-To: afiqamri03@gmail.com'); expect(raw).toContain('List-Unsubscribe-Post: List-Unsubscribe=One-Click'); expect(raw).toContain(Buffer.from('Hello Café').toString('base64'));
    const body = Buffer.from(raw.split('\r\n\r\n')[1].replaceAll('\r\n', ''), 'base64').toString(); expect(body).toContain('A thoughtful introduction.'); expect(body).toContain(message.unsubscribeUrl);
  });
  it('verifies the connected identity before sending and captures the Gmail thread', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ access_token: 'test-only', expires_in: 3600 })).mockResolvedValueOnce(Response.json({ emailAddress: 'afiqamri03@gmail.com' })).mockResolvedValueOnce(Response.json({ id: 'gmail-id', threadId: 'thread-id' }));
    vi.stubGlobal('fetch', fetch);
    expect(await sendGmail(message)).toEqual({ id: 'gmail-id', threadId: 'thread-id' });
    expect(fetch.mock.calls[2][0]).toContain('/messages/send'); expect(JSON.parse(fetch.mock.calls[2][1].body).raw).toBe(gmailMime(message));
  });
  it('does not send from a different connected Gmail account', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ emailAddress: 'someoneelse@gmail.com' })); vi.stubGlobal('fetch', fetch);
    await expect(sendGmail(message)).rejects.toThrow('does not match'); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('keeps a follow-up in the original Gmail conversation with RFC reply headers', async () => {
    vi.mocked(prisma.emailMessage.findUnique).mockResolvedValueOnce({ ...message, id: 'initial-id', provider: 'gmail', threadId: 'original-thread', sentAt: new Date() });
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ emailAddress: 'afiqamri03@gmail.com' })).mockResolvedValueOnce(Response.json({ id: 'follow-up-id', threadId: 'original-thread' }));
    vi.stubGlobal('fetch', fetch);
    await sendGmail({ ...message, step: 1, enrollmentId: 'enrollment-1' });
    const payload = JSON.parse(fetch.mock.calls[1][1].body);
    expect(payload.threadId).toBe('original-thread');
    const mime = Buffer.from(payload.raw, 'base64url').toString();
    expect(mime).toContain('In-Reply-To: <zwf.initial-id@zero-web-finder.local>');
    expect(mime).toContain('References: <zwf.initial-id@zero-web-finder.local>');
  });
  it('does not send a follow-up if the original conversation is missing', async () => {
    vi.mocked(prisma.emailMessage.findUnique).mockResolvedValueOnce(null);
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ emailAddress: 'afiqamri03@gmail.com' }));
    vi.stubGlobal('fetch', fetch);
    await expect(sendGmail({ ...message, step: 1, enrollmentId: 'missing-thread' })).rejects.toThrow('original Gmail conversation');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('refreshes access after the configured Gmail credential changes', async () => {
    vi.stubEnv('GMAIL_REFRESH_TOKEN', 'rotated-test-refresh-token');
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ access_token: 'rotated-access', expires_in: 3600 }));
    vi.stubGlobal('fetch', fetch);
    expect(await gmailToken()).toBe('rotated-access');
    expect(await gmailToken()).toBe('rotated-access');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0][1].body)).toContain('rotated-test-refresh-token');
  });
  it('rejects malformed or multiple mailboxes before any Gmail request', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    for (const patch of [{ recipient: 'one,two@example.com' }, { replyTo: 'one@example.com;two@example.com' }, { sender: 'First <first@example.com>, Owner <afiqamri03@gmail.com>' }, { recipient: 'one@example.com\r\nBcc: two@example.com' }]) {
      expect(() => gmailMime({ ...message, ...patch })).toThrow('one valid');
      await expect(sendGmail({ ...message, ...patch })).rejects.toThrow('one valid');
    }
    await expect(checkGmailIdentity('one,two@gmail.com')).rejects.toThrow('one valid');
    expect(fetch).not.toHaveBeenCalled();
  });
});
