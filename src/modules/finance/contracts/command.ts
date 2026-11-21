import type { Action } from '../domain/actions';
import type { State } from '../domain/model';

export interface Confirmed {
  state: State;
  revision: number;
  replay?: boolean;
  resultId?: string;
  periods?: string[];
}
export interface Command {
  period: string;
  requestId: string;
  revision: number;
  action: Action;
  duplicateConfirmation?: string;
}
export interface DuplicateNotice {
  token: string;
  entries: {
    id: string;
    amount: number;
    date: string;
    description: string;
    author: string | null;
    createdAt: string;
    sourceNames: Record<string, string>;
  }[];
}
