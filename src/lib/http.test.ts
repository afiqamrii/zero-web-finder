import { describe, expect, it } from 'vitest';
import { jsonBody } from './http';

describe('bounded API request parsing', () => {
  it('accepts JSON objects and rejects primitives, arrays and malformed JSON', async () => {
    const request = (body: string) => new Request('https://workspace.test/api/test', { method: 'POST', body });
    expect(await jsonBody(request('{"name":"Kopi"}'))).toEqual({ name: 'Kopi' });
    for (const body of ['[]', 'null', 'true', '"text"', '{']) await expect(jsonBody(request(body))).rejects.toMatchObject({ status: 400 });
  });
  it('caps UTF-8 bytes even when the content length is missing or falsely small', async () => {
    const request = new Request('https://workspace.test/api/test', { method: 'POST', headers: { 'content-length': '1' }, body: JSON.stringify({ text: 'é'.repeat(125000) }) });
    await expect(jsonBody(request)).rejects.toMatchObject({ status: 413 });
  });
  it('stops a streamed request before reading the rest of an oversized body', async () => {
    let cancelled = false, pulls = 0;
    const body = new ReadableStream<Uint8Array>({ pull(controller) { pulls++; controller.enqueue(new Uint8Array(100000)); }, cancel() { cancelled = true; } });
    const request = new Request('https://workspace.test/api/test', { method: 'POST', body, duplex: 'half' } as RequestInit);
    await expect(jsonBody(request)).rejects.toMatchObject({ status: 413 });
    expect(cancelled).toBe(true); expect(pulls).toBeLessThanOrEqual(5);
  });
});
