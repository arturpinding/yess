const BROADCAST_CAPTURE_PATH = /^\/(?:et|en)\/broadcast\/?$/;

function withoutQueryOrFragment(value: string): string {
  const separator = value.search(/[?#]/);
  return separator === -1 ? value : value.slice(0, separator);
}

export function isBroadcastCapturePath(value: string): boolean {
  return BROADCAST_CAPTURE_PATH.test(withoutQueryOrFragment(value));
}

/**
 * Permissions-Policy belongs to the active document. Crossing the only route
 * that grants camera/microphone therefore needs a real document request, not a
 * Next.js client transition that would retain the previous document policy.
 */
export function requiresCameraPolicyDocumentNavigation(
  currentPathname: string,
  destinationHref: string,
): boolean {
  return isBroadcastCapturePath(currentPathname) || isBroadcastCapturePath(destinationHref);
}
