import { networkInterfaces } from 'node:os';
import { isIPv4 } from 'node:net';
import { performance } from 'node:perf_hooks';

export function inHomeSubnet(address, ip) {
  return isIPv4(address) && isIPv4(ip) &&
    address.slice(0, address.lastIndexOf('.')) === ip.slice(0, ip.lastIndexOf('.'));
}

export function sameHome(config, actual) {
  const mac = value => String(value).replaceAll('-', ':').toLowerCase();
  return actual?.profile === 'Private' && actual.firewall === true && actual.prefix === 24 &&
    !!config.networkName && actual.networkName === config.networkName &&
    actual.guid === config.interfaceGuid && actual.address === config.address &&
    actual.gateway === config.gateway && mac(actual.gatewayMac) === mac(config.gatewayMac);
}

export function networkLease(config, clocks = { monotonic: () => performance.now(), wall: Date.now }, interfaces = networkInterfaces) {
  let stamp;
  function revoke() { stamp = undefined; }
  function renew(actual) {
    revoke();
    if (sameHome(config, actual)) stamp = { mono: clocks.monotonic(), wall: clocks.wall() };
    return !!stamp;
  }
  function live() {
    if (!stamp) return false;
    const wall = clocks.wall() - stamp.wall;
    const mono = clocks.monotonic() - stamp.mono;
    return wall >= 0 && wall < 12000 && mono >= 0 && mono < 12000 &&
      interfaces()[config.interfaceAlias]?.some(iface => iface.family === 'IPv4' && iface.address === config.address &&
        iface.netmask === '255.255.255.0') === true;
  }
  return { renew, revoke, live };
}
