import type { Locale } from "@/i18n/config";
import type { BroadcastConnectionPhase, BroadcastErrorKind } from "./rtc";

const et = {
  navLabel: "Kaamerast otse",
  eyebrow: "Otse seadmete vahel · näidis",
  publisherTitle: "Jaga selle telefoni kaamerapilti",
  publisherIntro:
    "Loo ajutine otseühendus ja ava pilt ühe arvuti brauseris. Selle näidise jaoks võiksid mõlemad seadmed olla samas võrgus.",
  viewerTitle: "Vaata telefoni kaamerapilti",
  viewerIntro:
    "Sisesta telefonis näidatud kaheksa märgiga kood. Ühe otseühendusega saab liituda üks vaataja.",
  privacy:
    "RADA server vahendab ainult ühenduse loomise andmeid. Video liigub otse seadmete vahel ning server ei salvesta seda.",
  secureHelp:
    "Telefonis ava leht HTTPS-aadressiga ja luba kaamera ning mikrofon. HTTP töötab ainult localhostis.",
  camera: "Kaamera",
  rearCamera: "Tagakaamera",
  frontCamera: "Esikaamera",
  start: "Luba kaamera ja alusta",
  stop: "Lõpeta ülekanne",
  mute: "Vaigista mikrofon",
  unmute: "Lülita mikrofon sisse",
  localPreview: "Telefoni kaamera eelvaade",
  previewPlaceholder: "Kaamera eelvaade ilmub siia",
  codeLabel: "Vaataja kood",
  codeHelp: "Sisesta see kood arvutis. Kood aegub koos ajutise seansiga.",
  viewerUrl: "Vaatamislink",
  copyCode: "Kopeeri kood",
  copyLink: "Kopeeri vaatamislink",
  copied: "Kopeeritud",
  copyFailed: "Kopeerimine ei õnnestunud. Märgi tekst ja kopeeri käsitsi.",
  statusLabel: "Ühenduse olek",
  expiresAt: "Seanss aegub",
  openViewer: "Ava vaatamisvaade",
  codeInput: "Ülekande kood",
  codePlaceholder: "ABCD-EFGH",
  codeHint: "Kaheksa märki, näiteks ABCD-EFGH",
  invalidCode: "Sisesta telefonis näidatud kaheksa märgiga kood.",
  join: "Liitu ülekandega",
  leave: "Lahku",
  remoteVideo: "Telefoni otsevideo",
  waitingVideo: "Pilt ilmub, kui ühendus telefoniga on loodud.",
  oneViewer:
    "Näidis toetab ühte vaatajat. Kui kood on teises brauseris juba kasutatud, loo telefonis uus ülekanne.",
  playHelp: "Kui video ei käivitu automaatselt, vajuta esitusnuppu.",
  retry: "Proovi uuesti",
  phases: {
    idle: "Valmis kaameraluba küsima",
    requesting: "Küsime kaamera ja mikrofoni luba…",
    preparing: "Loome turvalist otseühendust…",
    waiting: "Ootame arvutis vaatajat",
    connecting: "Ühendame seadmeid…",
    live: "Otseühendus töötab",
    stopped: "Ülekanne lõpetatud",
    failed: "Ühendust ei õnnestunud luua",
  } satisfies Record<BroadcastConnectionPhase, string>,
  errors: {
    permission_denied:
      "Kaamera või mikrofoni luba ei antud. Ava brauseri saidiseaded, luba juurdepääs ja proovi uuesti.",
    camera_not_found: "Selles seadmes ei leitud sobivat kaamerat.",
    camera_busy: "Kaamerat kasutab teine rakendus. Sulge see rakendus ja proovi uuesti.",
    insecure_context:
      "Brauser lubab telefonikaamerat ainult turvalisel HTTPS-lehel. Ava selle lehe HTTPS-aadress.",
    unsupported_browser:
      "See brauser ei toeta vajalikku kaamera- või WebRTC-funktsiooni. Proovi uuemat Chrome'i või Safarit.",
    network: "Signaaliserveriga ei saadud ühendust. Kontrolli võrku ja proovi uuesti.",
    session_not_found: "Seda koodi ei leitud või seanss on aegunud. Loo telefonis uus ülekanne.",
    viewer_claimed: "Selle ülekandega on juba üks vaataja liitunud.",
    rate_limited: "Päringuid oli liiga palju. Oota hetk ja proovi uuesti.",
    ice_failed:
      "Seadmed ei leidnud otseühenduse teed. Veendu, et need on samas võrgus, ja proovi uuesti.",
    cancelled: "Toiming katkestati.",
    unexpected: "Ülekannet ei õnnestunud käivitada. Proovi uuesti.",
  } satisfies Record<BroadcastErrorKind, string>,
} as const;

export type BroadcastCopy = Omit<{ [Key in keyof typeof et]: string }, "phases" | "errors"> & {
  phases: Record<BroadcastConnectionPhase, string>;
  errors: Record<BroadcastErrorKind, string>;
};

const en: BroadcastCopy = {
  navLabel: "Broadcast",
  eyebrow: "Direct device demo",
  publisherTitle: "Share this phone's camera",
  publisherIntro:
    "Create a temporary live connection and open it in one computer browser. Keep both devices on the same network for this demo.",
  viewerTitle: "Watch the phone camera",
  viewerIntro:
    "Enter the eight-character code shown on the phone. One viewer can join each direct connection.",
  privacy:
    "The RADA server only exchanges connection setup data. Video travels directly between the devices and is not recorded by the server.",
  secureHelp:
    "Open the phone page over HTTPS and allow camera and microphone access. HTTP only works on localhost.",
  camera: "Camera",
  rearCamera: "Rear camera",
  frontCamera: "Front camera",
  start: "Allow camera and start",
  stop: "Stop broadcast",
  mute: "Mute microphone",
  unmute: "Turn microphone on",
  localPreview: "Phone camera preview",
  previewPlaceholder: "Your camera preview will appear here",
  codeLabel: "Viewer code",
  codeHelp: "Enter this code on the computer. It expires with the temporary session.",
  viewerUrl: "Viewer link",
  copyCode: "Copy code",
  copyLink: "Copy viewer link",
  copied: "Copied",
  copyFailed: "Copying failed. Select the text and copy it manually.",
  statusLabel: "Connection status",
  expiresAt: "Session expires",
  openViewer: "Open viewer",
  codeInput: "Broadcast code",
  codePlaceholder: "ABCD-EFGH",
  codeHint: "Eight characters, for example ABCD-EFGH",
  invalidCode: "Enter the eight-character code shown on the phone.",
  join: "Join broadcast",
  leave: "Leave",
  remoteVideo: "Live video from the phone",
  waitingVideo: "The picture appears after a connection to the phone is established.",
  oneViewer:
    "The demo supports one viewer. If another browser already used the code, create a new broadcast on the phone.",
  playHelp: "If video does not start automatically, press play.",
  retry: "Try again",
  phases: {
    idle: "Ready to request camera access",
    requesting: "Requesting camera and microphone access…",
    preparing: "Preparing the direct connection…",
    waiting: "Waiting for a viewer on the computer",
    connecting: "Connecting the devices…",
    live: "Direct connection is live",
    stopped: "Broadcast stopped",
    failed: "Could not establish the connection",
  },
  errors: {
    permission_denied:
      "Camera or microphone access was denied. Allow access in the browser's site settings and try again.",
    camera_not_found: "No suitable camera was found on this device.",
    camera_busy: "Another app is using the camera. Close that app and try again.",
    insecure_context:
      "Mobile browsers only allow camera access on a secure HTTPS page. Open the HTTPS address for this page.",
    unsupported_browser:
      "This browser lacks a required camera or WebRTC feature. Try a current version of Chrome or Safari.",
    network: "The signaling server could not be reached. Check the network and try again.",
    session_not_found:
      "That code was not found or the session expired. Create a new phone broadcast.",
    viewer_claimed: "One viewer has already joined this broadcast.",
    rate_limited: "Too many requests were made. Wait a moment and try again.",
    ice_failed:
      "The devices could not find a direct connection path. Check that they are on the same network and try again.",
    cancelled: "The operation was cancelled.",
    unexpected: "The broadcast could not be started. Try again.",
  },
};

export function getBroadcastCopy(locale: Locale): BroadcastCopy {
  return locale === "et" ? et : en;
}
