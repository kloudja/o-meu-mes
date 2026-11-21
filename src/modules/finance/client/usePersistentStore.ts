'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Confirmed, Command, DuplicateNotice } from '../contracts/command';
import type { Action } from '../domain/actions';
import { DomainError } from '../domain/validation';
import { newRequestId } from './requestId';

interface Ticket {
  requestId: string;
  period: string;
  status: 'pending' | 'confirmed' | 'closed';
}
export class DuplicateConfirmationRequired extends DomainError {
  constructor(
    message: string,
    public notice: DuplicateNotice,
  ) {
    super('DUPLICATE', message);
  }
}
export function usePersistentStore(owner: string, space: string, initialPeriod?: string, readOnly = false) {
  const [confirmed, setConfirmed] = useState<Confirmed | null>(null),
    [busy, setBusy] = useState(false);
  const [inboxReady, setInboxReady] = useState(readOnly);
  const [outdated, setOutdated] = useState(false);
  const [error, setError] = useState(''),
    [ticket, setTicket] = useState<Ticket | null>(null);
  const inboxVersion = useRef(0),
    generation = useRef(0),
    selection = useRef(initialPeriod),
    current = useRef<Confirmed | null>(null);
  const localUncertain = useRef(false),
    flight = useRef(false),
    requests = useRef(new Set<AbortController>()),
    recoverable = useRef<Ticket | null>(null);
  const query = '?spaceId=' + encodeURIComponent(space);
  const valid = (stamp: number) => generation.current === stamp;
  async function call<T>(route: string, payload?: unknown): Promise<T> {
    const stamp = generation.current;
    const controller = new AbortController();
    requests.current.add(controller);
    try {
      const response = await fetch(route, {
        method: payload === undefined ? 'GET' : 'POST',
        headers: {
          'X-Account': owner,
          ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: payload === undefined ? undefined : JSON.stringify(payload),
        cache: 'no-store',
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 403 && valid(stamp)) {
          if (data.code === 'SPACE_ACCESS' || data.code === 'READ_ONLY')
            window.dispatchEvent(
              new CustomEvent('omeumes.spaceAccess', { detail: { space, code: data.code } }),
            );
          else window.dispatchEvent(new Event('omeumes.access'));
        }
        if (response.status === 409 && data.code === 'DUPLICATE')
          throw new DuplicateConfirmationRequired(data.message, data.duplicate);
        if (response.status < 500) throw new DomainError(data.code ?? 'ACCESS', data.message);
        throw new Error(data.message);
      }
      return data;
    } finally {
      requests.current.delete(controller);
    }
  }
  const remember = (row: Ticket | null) => {
    recoverable.current = row;
    setTicket(row);
  };
  function accept(result: Confirmed) {
    if (current.current && result.revision < current.current.revision) return;
    current.current = result;
    selection.current = result.state.selected || undefined;
    setConfirmed(result);
  }
  const request = (operation: 'prepare' | 'resolve' | 'ack', t: Ticket) =>
    call<{ request: Ticket }>('/api/requests' + query, {
      operation,
      requestId: t.requestId,
      period: t.period,
    });
  async function refresh() {
    const stamp = generation.current,
      period = selection.current;
    try {
      const result = await call<Confirmed>(
        '/api/state' + query + (period ? '&period=' + encodeURIComponent(period) : ''),
      );
      if (!valid(stamp)) return false;
      accept(result);
      setOutdated(false);
      setError('');
      return result;
    } catch (e) {
      if (valid(stamp)) {
        setError((e as Error).message);
        setOutdated(current.current !== null);
      }
      return false;
    }
  }
  async function checkInbox() {
    if (readOnly) return;
    const stamp = generation.current,
      version = ++inboxVersion.current;
    try {
      const data = await call<{ requests: Ticket[] }>('/api/requests' + query);
      if (valid(stamp) && version === inboxVersion.current && !flight.current) {
        if (!localUncertain.current) remember(data.requests[0] ?? null);
        setInboxReady(true);
      }
    } catch (e) {
      if (valid(stamp)) setError((e as Error).message);
    }
  }
  function invalidate() {
    generation.current++;
    localUncertain.current = false;
    for (const c of requests.current) c.abort();
    flight.current = false;
    current.current = null;
  }
  function selectPeriod(period: string) {
    if (period === selection.current && current.current) return;
    invalidate();
    selection.current = period;
    setInboxReady(readOnly);
    setConfirmed(null);
    setOutdated(false);
    setBusy(false);
    setError('');
    remember(null);
    void refresh();
    void checkInbox();
  }
  useLayoutEffect(() => () => invalidate(), []);
  useEffect(() => {
    const poll = () => {
      if (!document.hidden && !flight.current) {
        void refresh();
        void checkInbox();
      }
    };
    poll();
    window.addEventListener('focus', poll);
    const timer = setInterval(poll, 5000);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', poll);
    };
  }, [owner, space, readOnly]);
  async function dispatch(
    action: Action,
    requestId = newRequestId(),
    revision?: number,
    duplicateConfirmation?: string,
  ) {
    if (readOnly) throw new DomainError('ACCESS', 'Neste espaço, a tua permissão é de leitura.');
    if (!inboxReady || flight.current || recoverable.current)
      throw new Error('Verifica primeiro a confirmação em curso.');
    if (!current.current) throw new Error('Aguarda a abertura do mês.');
    if (outdated) throw new DomainError('STALE_READ', 'Atualize os dados antes de confirmar.');
    const stamp = ++generation.current;
    inboxVersion.current++;
    const period = current.current.state.selected || (action.type === 'month' ? action.period : '');
    const command: Command = {
      period,
      requestId,
      revision: revision ?? current.current.revision,
      action,
      duplicateConfirmation,
    };
    const ref: Ticket = { requestId, period, status: 'pending' };
    flight.current = true;
    setBusy(true);
    setError('');
    try {
      const reserved = await request('prepare', ref);
      if (!valid(stamp)) throw new Error('O contexto mudou.');
      if (reserved.request.status === 'closed')
        throw new DomainError('IDEMPOTENCY', 'Esta tentativa foi encerrada.');
      const data = await call<Confirmed>('/api/state' + query, command);
      if (!valid(stamp)) throw new Error('O contexto mudou.');
      await request('ack', ref);
      if (!valid(stamp)) throw new Error('O contexto mudou.');
      accept(data);
      remember(null);
      return data;
    } catch (e) {
      if (valid(stamp)) {
        localUncertain.current = true;
        remember(ref);
        if (e instanceof DomainError && !['ACCESS', 'SPACE_ACCESS', 'READ_ONLY'].includes(e.code)) {
          try {
            const resolved = await request('resolve', ref);
            if (resolved.request.status === 'closed') await request('ack', ref);
            if (valid(stamp) && resolved.request.status === 'closed') {
              localUncertain.current = false;
              remember(null);
            }
          } catch {
            /* The server inbox keeps the unresolved confirmation. */
          }
        }
      }
      throw e;
    } finally {
      if (valid(stamp)) {
        flight.current = false;
        setBusy(false);
      }
    }
  }
  async function retry() {
    const stamp = generation.current,
      ref = recoverable.current;
    if (!ref || flight.current) throw new Error('Aguarda a verificação.');
    inboxVersion.current++;
    flight.current = true;
    setBusy(true);
    try {
      const found = await call<{ request: Ticket | null }>(
        '/api/requests' +
          query +
          '&requestId=' +
          encodeURIComponent(ref.requestId) +
          '&period=' +
          encodeURIComponent(ref.period),
      );
      if (!valid(stamp)) throw new Error('O contexto mudou.');
      // An absent or in-flight request is not terminal until this write wins the race.
      const result =
        found.request?.status === 'confirmed' || found.request?.status === 'closed'
          ? { request: found.request }
          : await request('resolve', ref);
      if (!valid(stamp)) throw new Error('O contexto mudou.');
      if (!(await refresh())) throw new Error('Volta a consultar a confirmação.');
      await request('ack', ref);
      if (!valid(stamp)) throw new Error('O contexto mudou.');
      localUncertain.current = false;
      remember(null);
      return result.request.status === 'confirmed';
    } finally {
      if (valid(stamp)) {
        flight.current = false;
        setBusy(false);
        void checkInbox();
      }
    }
  }
  return {
    state: confirmed?.state,
    periods: confirmed?.periods ?? [],
    selectPeriod,
    revision: confirmed?.revision,
    getRevision: () => current.current?.revision,
    historyHeaders: { 'X-Account': owner },
    spaceId: space,
    busy: busy || !inboxReady,
    uncertain: !!ticket,
    pendingPeriod: ticket?.period,
    error,
    outdated,
    dispatch,
    refresh,
    retry,
  };
}
