import type { accountFunding } from '../domain/funding';
import type { Screen } from '../i18n/pt-PT';
export type FinanceModal = {
  kind: string;
  id?: string;
  target?: 'base';
  source?: string;
  reserveId?: string;
  otherBank?: boolean;
  optionalGoal?: boolean;
  fromExpenseRemainder?: boolean;
  requestId: string;
  revision?: number;
  returnTo?: string;
  eventId?: string;
};
export interface FinanceMemory {
  funding?: {
    space: string;
    period: string;
    date: string;
    review: { period: string; revision?: number; report: ReturnType<typeof accountFunding> };
  };
  space?: string;
  period?: string;
  screen?: Screen;
  draft?: { space: string; period: string; modal: FinanceModal; values: Record<string, string> };
}
