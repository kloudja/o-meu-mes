import type { Action } from '../domain/actions';
import type { State } from '../domain/model';

export interface Confirmed {
  state: State;
  revision: number;
  replay?: boolean;
}
export interface Command {
  period: string;
  requestId: string;
  revision: number;
  action: Action;
}
