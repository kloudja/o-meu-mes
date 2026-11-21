export interface Account {
  id: string;
  name: string;
  country: string;
  interfaceLocale: string;
  communicationLocale: string;
  email: string;
  pendingEmail: string | null;
  verified: boolean;
  mfa: boolean;
  hasCodes: boolean;
  scope: 'pending' | 'account' | 'replace' | 'closure';
  delivery: string | null;
  expiresAt: number;
}
export interface IdentityView {
  account: Account | null;
  sessions: { id: string; current: boolean; created: number; active: number; remembered: boolean }[];
  documents: {
    kind: string;
    version: string;
    country: string;
    locale: string;
    title: string;
    content: string;
  }[];
  refresh: number;
}
export interface Feedback {
  message?: string;
  fields?: Record<string, string>;
  secret?: string;
  codes?: string[];
}
