import { Contact, ContactField, getPermissionsAsync, requestPermissionsAsync } from 'expo-contacts';

/** The one contact a user picked, cut down to what an invite needs. */
export type ContactInvitee = {
  name: string | null;
  email: string | null;
  phone: string | null;
};

export class ContactsDeniedError extends Error {
  constructor() {
    super('At The Bar cannot see your contacts. Invite by email or send a link instead.');
  }
}

/**
 * Opens the system contact picker and returns the person the user chose, or
 * null if they backed out. Only the picked contact is ever read: the app never
 * walks the address book, so nobody's contacts are uploaded to match against
 * other users, and the permission is asked for at the moment it is needed
 * rather than at sign-up.
 */
export async function pickContact(): Promise<ContactInvitee | null> {
  const existing = await getPermissionsAsync();
  const permission = existing.granted ? existing : await requestPermissionsAsync();
  if (!permission.granted) throw new ContactsDeniedError();

  const contact = await Contact.presentPicker();
  if (!contact) return null;

  const details = await contact.getDetails([
    ContactField.FULL_NAME,
    ContactField.EMAILS,
    ContactField.PHONES,
  ]);

  return {
    name: details.fullName,
    email: details.emails.find((email) => email.address)?.address ?? null,
    phone: details.phones.find((phone) => phone.number)?.number ?? null,
  };
}
