import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ThemeMode = "light" | "dark" | "system";
export type Brand = "blog" | "blog-admin" | "gosso-admin";
export type Density = "comfortable" | "compact";
export const brandNames: Record<Brand, string> = {
  blog: "Blog",
  "blog-admin": "Blog Admin",
  "gosso-admin": "GOSSO Admin",
};
export function resolveMode(
  mode: ThemeMode,
  systemDark: boolean,
): "light" | "dark" {
  return mode === "system" ? (systemDark ? "dark" : "light") : mode;
}
export function readMode(key: string): ThemeMode {
  try {
    const value = localStorage.getItem(key);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}
interface ThemeContextValue {
  mode: ThemeMode;
  resolvedMode: "light" | "dark";
  brand: Brand;
  setMode: (mode: ThemeMode) => void;
}
const ThemeContext = createContext<ThemeContextValue>({
  mode: "system",
  resolvedMode: "light",
  brand: "blog",
  setMode: () => {},
});
export const useTheme = () => useContext(ThemeContext);
export function ThemeProvider({
  children,
  brand,
  storageKey,
  density = "comfortable",
}: {
  children: ReactNode;
  brand: Brand;
  storageKey: string;
  density?: Density;
}) {
  const [mode, updateMode] = useState<ThemeMode>(() => readMode(storageKey));
  const [systemDark, setSystemDark] = useState(
    () =>
      typeof matchMedia === "function" &&
      matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const resolvedMode = resolveMode(mode, systemDark);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(query.matches);
    const storage = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null)
        updateMode(readMode(storageKey));
    };
    update();
    query.addEventListener("change", update);
    window.addEventListener("storage", storage);
    return () => {
      query.removeEventListener("change", update);
      window.removeEventListener("storage", storage);
    };
  }, [storageKey]);
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolvedMode;
    root.dataset.density = density;
    root.style.colorScheme = resolvedMode;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute(
        "content",
        resolvedMode === "dark" ? "#11151b" : "#ffffff",
      );
  }, [resolvedMode, density]);
  useLayoutEffect(() => {
    document.documentElement.dataset.brand = brand;
  }, [brand]);
  const value = useMemo(
    () => ({
      mode,
      resolvedMode,
      brand,
      setMode: (next: ThemeMode) => {
        updateMode(next);
        try {
          localStorage.setItem(storageKey, next);
        } catch {
          /* In-memory preference still works. */
        }
      },
    }),
    [mode, resolvedMode, brand, storageKey],
  );
  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
