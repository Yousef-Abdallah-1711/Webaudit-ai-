import { clsx, type ClassValue } from 'clsx';
import { twMerge } from './tailwind-merge-config';

export function cn(...values: ClassValue[]): string {
  return twMerge(clsx(values));
}
