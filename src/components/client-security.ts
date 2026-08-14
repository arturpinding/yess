const CSRF_COOKIE = "rada-csrf";

function readCookie(name: string): string | null {
  const prefix = `${encodeURIComponent(name)}=`;
  const cookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function ensureCsrfToken(): string {
  const existing = readCookie(CSRF_COOKIE);
  if (existing && existing.length >= 32) return existing;
  const token = randomToken();
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CSRF_COOKIE}=${token}; Path=/; Max-Age=28800; SameSite=Lax${secure}`;
  return token;
}

export function mutationHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-RADA-Request": "browser-mutation",
    "X-CSRF-Token": ensureCsrfToken(),
  };
}
