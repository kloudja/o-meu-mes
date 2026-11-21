import { request } from 'node:http';

// Connect locally while preserving the configured public Host header. Node fetch
// can replace that header with the loopback address, which the API must reject.
/**
 * @param {number | string} port
 * @param {string} path
 * @param {{method?: string, headers?: import('node:http').OutgoingHttpHeaders, body?: string, timeout?: number}} options
 * @returns {Promise<{status: number, body: string}>}
 */
export function requestLoopback(port, path, { method = 'GET', headers, body, timeout = 3000 } = {}) {
  return new Promise((resolve, reject) => {
    const call = request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers,
        agent: false,
        signal: AbortSignal.timeout(timeout),
      },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => resolve({ status: response.statusCode ?? 0, body }));
        response.on('error', reject);
      },
    );
    call.on('error', reject);
    call.end(body);
  });
}
