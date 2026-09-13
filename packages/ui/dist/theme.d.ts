import { type ReactNode } from "react";
export type ThemeMode = "light" | "dark" | "system";
export type Brand = "blog" | "blog-admin" | "gosso-admin";
export type Density = "comfortable" | "compact";
export declare const brandNames: Record<Brand, string>;
export declare function resolveMode(mode: ThemeMode, systemDark: boolean): "light" | "dark";
export declare function readMode(key: string): ThemeMode;
interface ThemeContextValue {
    mode: ThemeMode;
    resolvedMode: "light" | "dark";
    brand: Brand;
    setMode: (mode: ThemeMode) => void;
}
export declare const useTheme: () => ThemeContextValue;
export declare function ThemeProvider({ children, brand, storageKey, density, }: {
    children: ReactNode;
    brand: Brand;
    storageKey: string;
    density?: Density;
}): import("react").JSX.Element;
export {};
