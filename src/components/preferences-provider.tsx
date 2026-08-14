"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type Theme = "light" | "dark";

interface PreferencesContextValue {
  theme: Theme;
  spoilerFree: boolean;
  dataSaver: boolean;
  setTheme: (theme: Theme) => void;
  setSpoilerFree: (value: boolean) => void;
  setDataSaver: (value: boolean) => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function persistPreference(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export function PreferencesProvider({
  children,
  initialTheme,
  initialSpoilerFree,
  initialDataSaver,
}: {
  children: React.ReactNode;
  initialTheme: Theme;
  initialSpoilerFree: boolean;
  initialDataSaver: boolean;
}) {
  const [theme, updateTheme] = useState<Theme>(initialTheme);
  const [spoilerFree, updateSpoilerFree] = useState(initialSpoilerFree);
  const [dataSaver, updateDataSaver] = useState(initialDataSaver);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.spoilers = spoilerFree ? "hidden" : "visible";
  }, [spoilerFree]);

  const setTheme = useCallback((value: Theme) => {
    updateTheme(value);
    persistPreference("rada-theme", value);
  }, []);

  const setSpoilerFree = useCallback((value: boolean) => {
    updateSpoilerFree(value);
    persistPreference("rada-spoilers", value ? "hide" : "show");
    window.dispatchEvent(new CustomEvent("rada:spoilers", { detail: value }));
  }, []);

  const setDataSaver = useCallback((value: boolean) => {
    updateDataSaver(value);
    persistPreference("rada-data-saver", value ? "on" : "off");
  }, []);

  const value = useMemo(
    () => ({
      theme,
      spoilerFree,
      dataSaver,
      setTheme,
      setSpoilerFree,
      setDataSaver,
    }),
    [theme, spoilerFree, dataSaver, setTheme, setSpoilerFree, setDataSaver],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const value = useContext(PreferencesContext);
  if (!value) {
    throw new Error("usePreferences must be used inside PreferencesProvider");
  }
  return value;
}
