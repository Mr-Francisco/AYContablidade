import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Compõe classes Tailwind resolvendo conflitos (a última ganha). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
