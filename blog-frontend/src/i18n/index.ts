import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import zh from "./locales/zh.json";

export type Locale = "en" | "zh";

export const storageKey = "gouno-blog:locale";

export function getInitialLocale(): Locale {
  const stored =
    typeof localStorage !== "undefined"
      ? localStorage.getItem(storageKey)
      : null;
  if (stored === "en" || stored === "zh") return stored;
  if (typeof navigator !== "undefined") {
    return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
  }
  return "en";
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    zh: { translation: zh },
  },
  lng: getInitialLocale(),
  fallbackLng: "en",
  supportedLngs: ["en", "zh"],
  interpolation: { escapeValue: false },
});

export default i18n;
