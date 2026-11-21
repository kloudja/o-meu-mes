const lisbon = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Lisbon',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const fixed = new Set([
  '01-01',
  '04-25',
  '05-01',
  '06-10',
  '08-15',
  '10-05',
  '11-01',
  '12-01',
  '12-08',
  '12-25',
]);
const day = 86400000;
// Gregorian computus (Meeus/Jones/Butcher) for the two movable weekday holidays.
function easter(year: number) {
  const a = year % 19,
    b = Math.floor(year / 100),
    c = year % 100;
  const d = Math.floor(b / 4),
    e = b % 4,
    f = Math.floor((b + 8) / 25),
    g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30,
    i = Math.floor(c / 4),
    k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7,
    m = Math.floor((a + 11 * h + 22 * l) / 451);
  const value = h + l - 7 * m + 114;
  return Date.UTC(year, Math.floor(value / 31) - 1, (value % 31) + 1);
}
function dayOff(date: Date) {
  const sunday = easter(date.getUTCFullYear()),
    t = date.getTime();
  return (
    [0, 6].includes(date.getUTCDay()) ||
    fixed.has(date.toISOString().slice(5, 10)) ||
    t === sunday - 2 * day ||
    t === sunday + 60 * day
  );
}
export function calendarDeadline(received: number, months = 1) {
  const [year, month, date] = lisbon.format(received).split('-').map(Number);
  const last = new Date(Date.UTC(year, month + months, 0)).getUTCDate();
  const due = new Date(Date.UTC(year, month + months - 1, Math.min(date, last)));
  while (dayOff(due)) due.setUTCDate(due.getUTCDate() + 1);
  const end = due.getTime() + day - 1;
  // Lisbon summer time is UTC+1. Compare civil dates at the UTC day boundary.
  return lisbon.format(end) === due.toISOString().slice(0, 10) ? end : end - 3600000;
}
