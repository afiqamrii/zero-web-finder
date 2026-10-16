import { describe, it, expect, vi, afterEach } from 'vitest';
import { gmailMime, sendGmail } from './gmail';
import type { EmailMessage } from '@prisma/client';
const message = { id: 'test-id', sender: 'Afiq Amri <afiqamri03@gmail.com>', recipient: 'business@example.com', replyTo: 'afiqamri03@gmail.com', subject: 'Hello Café', body: 'A thoughtful introduction.', unsubscribeUrl: 'https://workspace.test/unsubscribe?token=test' } as EmailMessage;
afterEach(() => vi.unstubAllGlobals());
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
});
