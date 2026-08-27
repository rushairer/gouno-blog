/**
 * The route-level Admin boundary is the only frontend authorization gate.
 * This compatibility hook deliberately stays permissive so page components
 * cannot independently redirect or issue a second role lookup.
 */
export function useAdminGuard(_returnTo: string) {
  return true;
}
