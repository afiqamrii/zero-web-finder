import { normalizeEmail, safeWebUrl, validEmail } from './domain';

export const OPPORTUNITY_VERSION = 'local-rules-v1';
export const OPEN_OPPORTUNITY_STAGES = ['NEW', 'CONTACTED', 'WHATSAPP_SENT', 'REPLIED', 'CALL_SCHEDULED', 'PROPOSAL_SENT'];
export const OPPORTUNITY_SCAN_LIMIT = 500;
export const OPPORTUNITY_RESULT_LIMIT = 100;
export type OpportunityLead = {
  id: string; name: string; category: string; address: string; leadType: string; status: string;
  email?: string | null; emailVerified?: boolean; emailSource?: string | null; phone?: string | null;
  websiteUrl?: string | null; mapsUrl?: string | null; rating?: number | null; reviewCount?: number | null;
  notes?: string | null; demoUrl?: string | null; optedOutAt?: Date | string | null; updatedAt?: Date | string;
  lastContactedAt?: Date | string | null; dealValueCents?: number;
};
export type OpportunityContext = {
  suppression?: 'clear' | 'blocked' | 'unknown'; previouslyEnrolled?: boolean; duplicateContact?: boolean;
  senderName?: string; offer?: string;
};
export type OpportunityComponent = { id: string; label: string; points: number; max: number; reason: string };
export type OpportunityChecklistItem = { id: string; label: string; complete: boolean; detail: string };
export type OpportunityAction = { id: string; label: string; detail: string; group: 'outreach' | 'research' | 'conversation' | 'blocked' };
export type OpportunityAnalysis = {
  version: string; score: number; blocked: boolean; contactReady: boolean; canPrepareOutreach: boolean;
  components: OpportunityComponent[]; evidence: { present: number; total: number; label: string };
  checklist: OpportunityChecklistItem[]; caveats: string[]; nextAction: OpportunityAction;
  drafts: { subject: string; pitch: string; brief: string } | null;
};
export type OpportunityRecord = { lead: OpportunityLead; analysis: OpportunityAnalysis };
export type InsightsResponse = {
  version: string; generatedAt: string; mode: 'local-rules';
  coverage: { totalOpen: number; scanned: number; ranked: number; returned: number; excluded: number; scanLimit: number; resultLimit: number; scanCapped: boolean; resultCapped: boolean; selection: string };
  summary: { ready: number; research: number; conversations: number; averageScore: number; categories: { name: string; count: number }[] };
  opportunities: OpportunityRecord[];
};
const text = (value: string | null | undefined, max = 300) => (value || '').trim().slice(0, max);

function suggestedScope(category: string) {
  if (/cafe|café|restaurant|bakery|coffee|food/i.test(category)) return ['Menu or product highlights', 'Opening hours and location', 'Reservation or order-enquiry links'];
  if (/clinic|dent|physio|medical/i.test(category)) return ['Service information approved by the business', 'Location and opening hours', 'Appointment enquiry form with minimal personal data'];
  if (/salon|barber|beauty|spa/i.test(category)) return ['Service and pricing overview', 'Work gallery using approved photographs', 'Appointment enquiry links'];
  if (/shop|store|retail|boutique/i.test(category)) return ['Product-category highlights', 'Store information and opening hours', 'Product enquiry links'];
  return ['Clear service overview', 'Business information and approved examples of work', 'Enquiry form and contact links'];
}

export function analyzeOpportunity(lead: OpportunityLead, context: OpportunityContext = {}): OpportunityAnalysis {
  const email = normalizeEmail(lead.email || '');
  const hasEmail = validEmail(email), hasSource = Boolean(text(lead.emailSource));
  const website = safeWebUrl(lead.websiteUrl), maps = safeWebUrl(lead.mapsUrl);
  const blocked = Boolean(lead.optedOutAt || context.suppression === 'blocked' || !OPEN_OPPORTUNITY_STAGES.includes(lead.status));
  const contactReady = hasEmail && !!lead.emailVerified && hasSource;
  const websiteConflict = lead.leadType === 'NO_WEBSITE' && !!website;
  const websiteKnown = ['NO_WEBSITE', 'OUTDATED_WEBSITE'].includes(lead.leadType);
  const components: OpportunityComponent[] = [];
  const websitePoints = websiteConflict ? 6 : lead.leadType === 'NO_WEBSITE' ? 25 : lead.leadType === 'OUTDATED_WEBSITE' ? (website ? 18 : 8) : 0;
  components.push({ id: 'website', label: 'Website need', points: websitePoints, max: 25, reason: websiteConflict ? 'Saved as “no website”, but a website link exists. Resolve this conflicting evidence.' : lead.leadType === 'NO_WEBSITE' ? 'Saved as “no website”. This is a discovery signal that still needs manual confirmation.' : lead.leadType === 'OUTDATED_WEBSITE' ? 'Saved as a possible website refresh. No technical or visual audit has been performed.' : 'No recognized website-opportunity classification is saved.' });
  components.push({ id: 'contact', label: 'Contact readiness', points: contactReady ? 20 : hasEmail ? (hasSource ? 8 : 5) : text(lead.phone) ? 4 : 0, max: 20, reason: contactReady ? 'A valid email, your verification, and an email source are saved. Outreach eligibility is checked separately.' : hasEmail ? 'An email exists, but verification or its source is missing.' : text(lead.phone) ? 'A phone is saved; a verified, sourced email is still needed for email campaigns.' : 'No usable email is saved. Research the business contact first.' });
  const reviews = typeof lead.reviewCount === 'number' && Number.isFinite(lead.reviewCount) ? Math.max(0, Math.floor(lead.reviewCount)) : 0;
  const rating = typeof lead.rating === 'number' && Number.isFinite(lead.rating) && lead.rating >= 0 && lead.rating <= 5 ? lead.rating : null;
  const reviewPoints = reviews >= 100 ? 12 : reviews >= 20 ? 10 : reviews >= 5 ? 6 : reviews > 0 ? 2 : 0;
  const ratingPoints = reviews > 0 && rating !== null ? rating >= 4.5 ? 8 : rating >= 4 ? 6 : rating >= 3.5 ? 3 : 1 : 0;
  components.push({ id: 'traction', label: 'Business traction', points: reviewPoints + ratingPoints, max: 20, reason: reviews ? `${reviews} saved reviews${rating !== null ? ` and a ${rating}/5 rating` : ''}. These are listing signals, not revenue, budget, or buying intent.` : 'No review-count evidence is saved. Missing data does not mean the business is weak.' });
  const momentum: Record<string, number> = { NEW: 0, CONTACTED: 6, WHATSAPP_SENT: 6, REPLIED: 14, CALL_SCHEDULED: 18, PROPOSAL_SENT: 20 };
  components.push({ id: 'momentum', label: 'Sales momentum', points: momentum[lead.status] || 0, max: 20, reason: lead.status === 'NEW' ? 'No conversation progress is recorded yet.' : `Saved stage: ${lead.status.toLowerCase().replaceAll('_', ' ')}. This reflects your pipeline record, not a predicted sale.` });
  const evidenceFields = [Boolean(text(lead.name)), Boolean(text(lead.category)), Boolean(text(lead.address)), Boolean(maps || website), hasSource];
  const evidenceCount = evidenceFields.filter(Boolean).length;
  components.push({ id: 'evidence', label: 'Evidence coverage', points: evidenceCount * 3, max: 15, reason: `${evidenceCount}/5 evidence fields present: business name, category, location, research link, and email source. Presence does not verify accuracy.` });
  const checklist: OpportunityChecklistItem[] = [
    { id: 'identity', label: 'Confirm the business identity and location', complete: !!text(lead.name) && !!text(lead.category) && !!text(lead.address), detail: 'Compare the saved details with a business-owned source.' },
    { id: 'research', label: 'Keep a research source', complete: !!(maps || website), detail: maps || website || 'Add a website or listing link so the evidence can be checked.' },
    { id: 'website', label: 'Confirm the actual website need', complete: false, detail: websiteConflict ? 'The saved classification conflicts with the website link. Check both before proposing work.' : 'Open the business’s official site or confirm that none exists. This local analysis does not visit websites.' },
    { id: 'email', label: 'Verify the business email and its source', complete: contactReady, detail: hasSource ? text(lead.emailSource, 500) : 'Record where you found or directly confirmed the email.' },
    { id: 'contact', label: 'Check opt-outs and previous outreach', complete: context.suppression === 'clear' && context.previouslyEnrolled !== undefined && !blocked && !context.previouslyEnrolled && !context.duplicateContact, detail: blocked ? 'This record must not be contacted.' : context.previouslyEnrolled ? 'This mailbox or lead already has campaign history; do not start a duplicate introduction.' : context.duplicateContact ? 'Multiple lead records share this mailbox. Review them before outreach.' : context.suppression !== 'clear' ? 'Open Opportunity Studio to check the saved suppression and enrollment records.' : 'Checked against the saved suppression and enrollment records for this analysis.' },
    { id: 'scope', label: 'Confirm scope, budget, and timing', complete: false, detail: 'Discuss these with the client. A score cannot establish their budget or interest.' },
  ];
  let nextAction: OpportunityAction;
  if (blocked) nextAction = { id: 'blocked', label: 'Keep outreach stopped', group: 'blocked', detail: 'This lead is closed, opted out, suppressed, or outside the supported open stages. It is excluded from recommendations.' };
  else if (lead.status === 'REPLIED') nextAction = { id: 'respond', label: 'Review the reply', group: 'conversation', detail: 'Read the conversation, clarify the client’s needs, and agree a useful next step.' };
  else if (lead.status === 'CALL_SCHEDULED') nextAction = { id: 'prepare-call', label: 'Prepare for the call', group: 'conversation', detail: 'Use the project brief to confirm goals, scope, budget, and timing during the call.' };
  else if (lead.status === 'PROPOSAL_SENT') nextAction = { id: 'review-proposal', label: 'Review the open proposal', group: 'conversation', detail: 'Check the existing conversation and agreed decision date before following up.' };
  else if (lead.status !== 'NEW' || context.previouslyEnrolled) nextAction = { id: 'review-history', label: 'Review existing outreach', group: 'conversation', detail: 'Check prior messages and replies. Do not send a new introduction to this mailbox.' };
  else if (context.duplicateContact) nextAction = { id: 'resolve-duplicate', label: 'Review the shared mailbox', group: 'research', detail: 'Multiple records use this email. Confirm which business and existing conversation it belongs to.' };
  else if (!contactReady) nextAction = { id: 'research-contact', label: 'Complete contact research', group: 'research', detail: 'Find a valid business email, save its source, and verify it before campaign enrollment.' };
  else if (context.suppression !== 'clear' || context.previouslyEnrolled === undefined) nextAction = { id: 'check-history', label: 'Check outreach eligibility', group: 'research', detail: 'The contact details are present; suppression and campaign history still need checking.' };
  else if (websiteConflict || !websiteKnown) nextAction = { id: 'research-website', label: 'Resolve website evidence', group: 'research', detail: 'Confirm the current website and update the opportunity classification before preparing an offer.' };
  else nextAction = { id: 'prepare-intro', label: 'Prepare an introduction', group: 'outreach', detail: 'Check the website need, adapt the draft, and review it in a campaign before approving any send.' };
  const canPrepareOutreach = nextAction.group === 'outreach';
  const caveats = ['Rules-based analysis of saved records only. No websites were visited and no external AI was used.', 'The score orders work; it is not a conversion probability, business valuation, or website audit.'];
  if (websiteConflict) caveats.push('Website evidence conflicts: a “no website” lead has a saved website URL.');
  if (!lead.reviewCount) caveats.push('Review evidence is missing; traction points remain low until evidence is added.');
  const name = text(lead.name, 200) || 'your business';
  const category = text(lead.category, 100);
  const address = text(lead.address, 300);
  const sender = text(context.senderName, 120);
  const offer = text(context.offer, 500);
  const scope = suggestedScope(category);
  const brief = [
    `PROJECT WORKING BRIEF — ${name}`, '', 'Saved facts to verify', `Business: ${name}`, `Category: ${category || 'Not saved'}`, `Location: ${address || 'Not saved'}`, `Website: ${website || 'No URL saved; this does not prove no website exists'}`, `Stage: ${lead.status.replaceAll('_', ' ').toLowerCase()}`,
    '', 'Working hypothesis', lead.leadType === 'NO_WEBSITE' ? 'A simple business website may be useful if the owner confirms there is no current official site.' : 'A website refresh may be useful if a manual review and the owner’s goals support it.',
    '', 'Possible scope to discuss (not agreed)', ...scope.map(item => `- ${item}`),
    '', 'Questions for the client', '- What should the website help customers do?', '- Which content and photographs can you provide or approve?', '- What budget, deadline, and decision process should we work with?',
    ...(offer ? ['', `Your saved offer (confirm scope before quoting): ${offer}`] : []),
    ...(text(lead.notes, 800) ? ['', `Saved owner notes (verify): ${text(lead.notes, 800)}`] : []),
    '', 'No scope, budget, timeline, or client interest has been confirmed by this analysis.',
  ].join('\n');
  const pitch = canPrepareOutreach ? [
    `Hi ${name} team,`, '', sender ? `I’m ${sender}, an independent web developer.` : 'I’m an independent web developer.',
    `I’d like to understand how ${name}${category ? ` (${category})` : ''} currently handles website enquiries.`,
    `Would a clearer website for ${scope[0].toLowerCase()} and customer enquiries be useful for your business? I’d be happy to understand what you already have and put together a relevant idea.`,
    ...(offer ? ['', `My current offer: ${offer}. We would confirm the scope together.`] : []),
    '', 'If this is relevant, would you be open to a short conversation?', ...(sender ? ['', sender] : []),
  ].join('\n') : '';
  const rankedComponents = blocked ? components.map(component => ({ ...component, points: 0, reason: 'Excluded from ranking. ' + component.reason })) : components;
  return { version: OPPORTUNITY_VERSION, score: rankedComponents.reduce((sum, component) => sum + component.points, 0), blocked, contactReady, canPrepareOutreach, components: rankedComponents, evidence: { present: evidenceCount, total: 5, label: evidenceCount >= 4 ? 'More evidence saved' : evidenceCount >= 2 ? 'Some evidence saved' : 'Limited saved evidence' }, checklist, caveats, nextAction, drafts: blocked ? null : { subject: `A website idea for ${name}`, pitch, brief } };
}

export function rankOpportunities(records: OpportunityRecord[]) {
  return [...records].filter(record => !record.analysis.blocked).sort((a, b) => b.analysis.score - a.analysis.score || a.lead.id.localeCompare(b.lead.id));
}
