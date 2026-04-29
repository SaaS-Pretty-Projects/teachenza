const PREVIEW_SESSION_KEY = 'tutivex:localPreviewSession';

export const previewUser = {
  uid: 'codex-local-preview',
  displayName: 'Codex Preview',
  email: 'preview@tutivex.local',
};

export function canUseLocalPreview() {
  const isDev = Boolean((import.meta as unknown as {env?: {DEV?: boolean}}).env?.DEV);

  return Boolean(
    isDev &&
      typeof window !== 'undefined' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname),
  );
}

export function enableLocalPreview() {
  if (!canUseLocalPreview()) return false;
  localStorage.setItem(PREVIEW_SESSION_KEY, '1');
  return true;
}

export function disableLocalPreview() {
  localStorage.removeItem(PREVIEW_SESSION_KEY);
}

export function isLocalPreviewEnabled() {
  return canUseLocalPreview() && localStorage.getItem(PREVIEW_SESSION_KEY) === '1';
}
