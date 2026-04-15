const SETTINGS_KEY = "ddm_settings";

interface AppSettings {
  guidedPrompts: boolean;
}

export function loadSettings(): AppSettings {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") as AppSettings;
  } catch {
    return { guidedPrompts: false };
  }
}

export function saveSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
  const s = loadSettings();
  s[key] = value;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

export function isGuidedPromptsEnabled(): boolean {
  return loadSettings().guidedPrompts === true;
}

export function setGuidedPromptsEnabled(on: boolean) {
  saveSetting("guidedPrompts", on);
}
