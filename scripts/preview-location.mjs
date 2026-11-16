export const previewPort = process.env.PREVIEW_PORT || '3100';
if (!/^\d+$/.test(previewPort) || Number(previewPort) < 1024 || Number(previewPort) > 65535) throw new Error('Choose a preview port from 1024 to 65535.');
export const previewAccessPath = previewPort === '3100' ? '.local/preview-access.json' : `.local/preview-access-${previewPort}.json`;
