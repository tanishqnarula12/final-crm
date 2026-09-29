// One wording for every "Delete …?" question. It names the exact record (so a
// clean-up can't catch a real record that looks like a test), says what goes
// with it, and says how to undo it — deletes are soft, and an admin can
// restore from Recently deleted. On 25 Aug 2026 three real Servicing records
// were removed behind a generic "Delete this Renewal? This cannot be undone."
export function confirmDelete(what, name, details = []) {
  const extra = details.filter(Boolean).join(' · ');
  return window.confirm(
    `Delete this ${what}?\n\n"${name || 'Untitled'}"${extra ? `\n${extra}` : ''}\n\n`
    + 'It disappears for everyone, and the people on it are notified. An admin can restore it from Recently deleted.',
  );
}

export const filesNote = (list) => (Array.isArray(list) && list.length ? `${list.length} file${list.length === 1 ? '' : 's'} attached` : '');
