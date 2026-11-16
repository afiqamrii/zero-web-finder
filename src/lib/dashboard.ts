import { inSendingWindow, malaysiaDayStart } from './domain';

type Schedule = { sendStartHour: number; sendEndHour: number; weekdaysOnly: boolean };
export function nextSendingWindow(settings: Schedule, now: Date) {
  if (inSendingWindow(settings, now)) return now;
  const day = malaysiaDayStart(now);
  for (let offset = 0; offset < 8; offset++) {
    const start = new Date(day.getTime() + (offset * 24 + settings.sendStartHour) * 3600000);
    if (start > now && inSendingWindow(settings, start)) return start;
  }
  return null;
}

export function automationSummary(input: {
  settings: Schedule & { sendingEnabled: boolean; dailyLimit: number; lastWorkerError: string | null };
  workerOnline: boolean; blockers: string[]; today: number; campaigns: number; now: Date;
}) {
  const { settings, workerOnline, blockers, today, campaigns, now } = input;
  const nextWindowAt = nextSendingWindow(settings, now)?.toISOString() ?? null;
  const status = (state: string, label: string, detail: string) => ({ state, label, detail, nextWindowAt });
  if (blockers.length) return status('setup', 'Setup needed', `${blockers.length} connection ${blockers.length === 1 ? 'step remains' : 'steps remain'} before campaigns can send.`);
  if (!settings.sendingEnabled) return status('paused', 'Sending paused', 'The master sending switch is off. Approved campaigns will wait.');
  if (settings.lastWorkerError) return status('error', 'Worker needs attention', 'The last worker run reported a problem. Open Automations to review it.');
  if (!workerOnline) return status('offline', 'Worker offline', 'No recent worker check-in. Scheduled messages will wait for it to reconnect.');
  if (today >= settings.dailyLimit) return { ...status('limit', 'Daily limit reached', 'Sending resumes during an allowed window after the allowance resets at midnight MYT.'), nextWindowAt: nextSendingWindow(settings, new Date(malaysiaDayStart(now).getTime() + 86400000))?.toISOString() ?? null };
  if (!inSendingWindow(settings, now)) return status('scheduled', 'Outside sending hours', 'Approved messages wait for your next sending window in Malaysia time.');
  if (!campaigns) return status('idle', 'Ready for a campaign', 'Create and approve a campaign to start outreach.');
  return status('ready', 'Sending enabled', 'The worker can process eligible messages from your approved campaigns.');
}
