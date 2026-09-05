import { cn } from "../../lib/utils";

export function classes(...values: Array<string | false | null | undefined>) {
  return cn(...values);
}
