import { money } from '../domain/money';
export const accountColors = {
  '#7a9c8c': '#246a54',
  '#9eabc3': '#365b96',
  '#6eaaa6': '#167b80',
  '#b3a1bb': '#754b8e',
  '#c79586': '#a7493b',
  '#c5ad74': '#826010',
};
export const accountColor = (color: string) =>
  accountColors[color.toLowerCase() as keyof typeof accountColors] ?? color;
export const isLongAmount = (amount: number | null) => amount !== null && money(amount).length > 13;
