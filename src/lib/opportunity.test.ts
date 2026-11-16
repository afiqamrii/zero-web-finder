import { describe, expect, it } from 'vitest';
import { analyzeOpportunity, rankOpportunities, type OpportunityContext, type OpportunityLead } from './opportunity';

const lead: OpportunityLead = { id: 'a', name: 'Kopi Example', category: 'Cafe', address: 'Petaling Jaya', leadType: 'NO_WEBSITE', status: 'NEW', email: 'hello@example.com', emailVerified: true, emailSource: 'Business contact page', mapsUrl: 'https://maps.google.com/?q=example', rating: 4.8, reviewCount: 120 };
const context: OpportunityContext = { suppression: 'clear', previouslyEnrolled: false, senderName: 'Test Owner', offer: 'Website packages from RM1,499' };
describe('local opportunity analysis', () => {
  it('is deterministic and explains every point without interpreting it as a probability', () => {
    const result = analyzeOpportunity(lead, context);
    expect(result).toEqual(analyzeOpportunity({ ...lead }, { ...context }));
    expect(result.score).toBe(80);
    expect(result.components.reduce((sum, item) => sum + item.points, 0)).toBe(result.score);
    expect(result.components.every(item => item.points >= 0 && item.points <= item.max && item.reason.length > 20)).toBe(true);
    expect(result.canPrepareOutreach).toBe(true);
    expect(result.evidence).toMatchObject({ present: 5, total: 5 });
    expect(result.caveats.join(' ')).toContain('not a conversion probability');
  });
  it.each(['WON', 'CLOSED', 'LOST', 'DO_NOT_CONTACT', 'UNRECOGNIZED'])('never recommends outreach to %s', status => {
    const result = analyzeOpportunity({ ...lead, status }, context);
    expect(result).toMatchObject({ blocked: true, score: 0, canPrepareOutreach: false, drafts: null });
    expect(result.nextAction.group).toBe('blocked');
    expect(result.components.every(item => item.points === 0)).toBe(true);
  });
  it('never recommends opted-out or suppressed leads even with strong evidence', () => {
    expect(analyzeOpportunity({ ...lead, optedOutAt: '2026-11-16' }, context).drafts).toBeNull();
    expect(analyzeOpportunity(lead, { ...context, suppression: 'blocked' }).blocked).toBe(true);
  });
  it('holds introductions until safety checks, verification, source and mailbox identity are clear', () => {
    for (const [record, settings] of [
      [lead, {}], [lead, { ...context, previouslyEnrolled: undefined }], [lead, { ...context, duplicateContact: true }],
      [{ ...lead, emailVerified: false }, context], [{ ...lead, emailSource: ' ' }, context], [{ ...lead, email: 'first@example.com,second@example.com' }, context],
    ] as [OpportunityLead, OpportunityContext][]) {
      const result = analyzeOpportunity(record, settings);
      expect(result.canPrepareOutreach).toBe(false); expect(result.drafts?.pitch).toBe('');
      expect(result.nextAction.group).toBe('research');
    }
  });
  it('moves existing outreach and advanced stages to conversation work, never a duplicate intro', () => {
    expect(analyzeOpportunity(lead, { ...context, previouslyEnrolled: true }).nextAction.id).toBe('review-history');
    for (const [status, action] of [['CONTACTED', 'review-history'], ['WHATSAPP_SENT', 'review-history'], ['REPLIED', 'respond'], ['CALL_SCHEDULED', 'prepare-call'], ['PROPOSAL_SENT', 'review-proposal']]) {
      const result = analyzeOpportunity({ ...lead, status }, context);
      expect(result.nextAction.id).toBe(action); expect(result.drafts?.pitch).toBe(''); expect(result.drafts?.brief).toContain('Questions for the client');
    }
  });
  it('requires research when a saved website contradicts the no-website classification', () => {
    const result = analyzeOpportunity({ ...lead, websiteUrl: 'https://example.com' }, context);
    expect(result.nextAction.id).toBe('research-website'); expect(result.components[0].points).toBe(6);
    expect(result.checklist.find(item => item.id === 'website')?.complete).toBe(false);
  });
  it('does not invent traction or an audit when fields are missing or invalid', () => {
    const result = analyzeOpportunity({ ...lead, rating: Infinity, reviewCount: -10, mapsUrl: '', address: '', emailSource: null }, context);
    expect(result.components.find(item => item.id === 'traction')?.points).toBe(0);
    expect(result.evidence.present).toBe(2); expect(Number.isFinite(result.score)).toBe(true);
    expect(result.caveats[0]).toContain('No websites were visited');
  });
  it('generates editable starting material from saved facts and clearly proposed scope', () => {
    const result = analyzeOpportunity(lead, context);
    expect(result.drafts?.pitch).toContain('Kopi Example'); expect(result.drafts?.pitch).toContain('Test Owner');
    expect(result.drafts?.pitch).toContain('RM1,499'); expect(result.drafts?.brief).toContain('Possible scope to discuss (not agreed)');
    expect(result.drafts?.brief).toContain('No scope, budget, timeline, or client interest has been confirmed');
    expect(result.drafts?.pitch).not.toMatch(/slow|broken|losing customers|guaranteed|conversion rate/i);
    expect(analyzeOpportunity(lead, { ...context, offer: '' }).drafts?.pitch).not.toContain('RM');
  });
  it('ranks consistently and removes excluded records without mutating input', () => {
    const records = ['b', 'a'].map(id => ({ lead: { ...lead, id }, analysis: analyzeOpportunity(lead, context) }));
    records.push({ lead: { ...lead, id: 'blocked' }, analysis: analyzeOpportunity(lead, { ...context, suppression: 'blocked' }) });
    expect(rankOpportunities(records).map(item => item.lead.id)).toEqual(['a', 'b']);
    expect(records.map(item => item.lead.id)).toEqual(['b', 'a', 'blocked']);
  });
});
