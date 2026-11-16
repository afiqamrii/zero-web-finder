export const PIPELINE_STAGES = [
  { id: 'NEW', label: 'New leads', statuses: ['NEW'], archived: false },
  { id: 'CONTACTED', label: 'Contacted', statuses: ['CONTACTED', 'WHATSAPP_SENT'], archived: false },
  { id: 'REPLIED', label: 'In conversation', statuses: ['REPLIED'], archived: false },
  { id: 'CALL_SCHEDULED', label: 'Call booked', statuses: ['CALL_SCHEDULED'], archived: false },
  { id: 'PROPOSAL_SENT', label: 'Proposal sent', statuses: ['PROPOSAL_SENT'], archived: false },
  { id: 'WON', label: 'Won', statuses: ['WON'], archived: false },
  { id: 'LOST', label: 'Lost', statuses: ['LOST'], archived: true },
  { id: 'CLOSED', label: 'Closed · legacy', statuses: ['CLOSED'], archived: true },
  { id: 'DO_NOT_CONTACT', label: 'Do not contact', statuses: ['DO_NOT_CONTACT'], archived: true },
] as const;
