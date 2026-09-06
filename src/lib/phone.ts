export function sanitizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  
  // Remove all non-numeric characters except '+'
  let cleaned = phone.replace(/[^\d+]/g, '');
  
  if (cleaned.startsWith('+60')) {
    cleaned = cleaned.substring(1);
  } else if (cleaned.startsWith('60')) {
    // already starts with 60, do nothing
  } else if (cleaned.startsWith('0')) {
    cleaned = '60' + cleaned.substring(1);
  } else if (cleaned.startsWith('+')) {
     cleaned = cleaned.substring(1);
  }
  
  // Ensure it only contains digits
  cleaned = cleaned.replace(/\D/g, '');
  
  if (cleaned.length < 8) return null;
  
  return cleaned;
}
