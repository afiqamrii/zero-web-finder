import type { Lead, Campaign, Workspace, DiscoveryJob, Activity } from '@prisma/client';
type Serialized<T> = { [K in keyof T]: T[K] extends Date ? string : T[K] extends Date | null ? string | null : T[K] };
export type LeadRecord = Serialized<Lead>;
export type CampaignRecord = Serialized<Campaign> & { eligible: number; _count: { enrollments: number } };
export type SettingsRecord = Serialized<Workspace>;
export type JobRecord = Serialized<DiscoveryJob>;
export type ActivityRecord = Serialized<Activity>;
export type Connections = Record<'access' | 'email' | 'webhook' | 'scheduler' | 'publicUrl' | 'sender' | 'replies', boolean>;
export type DashboardData = {
  preview: boolean;
  workerOnline: boolean;
  settings: Pick<SettingsRecord, 'dailyLimit' | 'sendingEnabled' | 'lastWorkerAt' | 'lastWorkerError' | 'sendStartHour' | 'sendEndHour' | 'weekdaysOnly'>;
  connections: Connections; blockers: string[]; stages: { status: string; _count: number; _sum: { dealValueCents: number | null } }[];
  revenue: number; emailStates: { status: string; _count: number }[]; today: number; activity: ActivityRecord[]; topLeads: LeadRecord[]; campaigns: number; jobs: number; verified: number;
  recentMessages: { id: string; subject: string; recipient: string; status: string; error: string | null; sentAt: string | null; scheduledAt: string; step: number; enrollment: { lead: { name: string }; campaign: { name: string } } }[];
};
