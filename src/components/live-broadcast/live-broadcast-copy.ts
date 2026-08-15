import type { Locale } from "@/i18n/config";
import type { BroadcastConnectionPhase } from "@/components/demo-broadcast/rtc";

export type ManagedBroadcastErrorKind =
  | "permission_denied"
  | "camera_not_found"
  | "camera_busy"
  | "camera_interrupted"
  | "insecure_context"
  | "unsupported_browser"
  | "invalid_access_key"
  | "provider_unavailable"
  | "session_not_found"
  | "broadcast_ended"
  | "rate_limited"
  | "network"
  | "unexpected";

export type LiveBroadcastCopy = {
  eyebrow: string;
  studioTitle: string;
  studioIntro: string;
  watch: string;
  managedTitle: string;
  managedBody: string;
  localPreview: string;
  previewPlaceholder: string;
  matchTitle: string;
  matchTitlePlaceholder: string;
  accessKey: string;
  accessKeyHint: string;
  camera: string;
  rearCamera: string;
  frontCamera: string;
  start: string;
  stop: string;
  mute: string;
  unmute: string;
  status: string;
  phases: Record<BroadcastConnectionPhase, string>;
  share: string;
  code: string;
  copyLink: string;
  copied: string;
  expires: string;
  viewerTitle: string;
  viewerIntro: string;
  startBroadcast: string;
  available: string;
  availableHint: string;
  noBroadcasts: string;
  refresh: string;
  codeInput: string;
  codeHint: string;
  codePlaceholder: string;
  invalidCode: string;
  open: string;
  leave: string;
  remoteVideo: string;
  waitingVideo: string;
  playHelp: string;
  live: string;
  preparing: string;
  errors: Record<ManagedBroadcastErrorKind, string>;
};

const et: LiveBroadcastCopy = {
  eyebrow: "Telefoni otseülekanne",
  studioTitle: "Filmi mängu telefoniga",
  studioIntro:
    "Telefon saadab kaamera pildi LiveKit Cloudi. Vaatajad avavad RADA veebilehe ja näevad sama ülekannet reaalajas.",
  watch: "Vaata ülekandeid",
  managedTitle: "Vercel ei vahenda videofaile",
  managedBody:
    "Vercel haldab ülekande loomist ja vaatamislehte. Video liigub telefonist otse voogedastusteenusesse ning sealt kõigi vaatajateni.",
  localPreview: "Telefoni kaamera eelvaade",
  previewPlaceholder: "Kaamera eelvaade ilmub siia pärast käivitamist.",
  matchTitle: "Mängu nimi",
  matchTitlePlaceholder: "Näiteks Kalev – Tartu",
  accessKey: "Ülekande võti",
  accessKeyHint: "Kasuta Verceli PHONE_BROADCAST_ACCESS_KEY väärtust.",
  camera: "Kaamera",
  rearCamera: "Tagumine kaamera",
  frontCamera: "Eesmine kaamera",
  start: "Luba kaamera ja alusta",
  stop: "Lõpeta ülekanne",
  mute: "Vaigista mikrofon",
  unmute: "Lülita mikrofon sisse",
  status: "Ühendus",
  phases: {
    idle: "Valmis",
    requesting: "Küsin kaamera luba",
    preparing: "Loon ülekannet",
    waiting: "Ootan teenust",
    connecting: "Ühendan",
    live: "Otse-eetris",
    stopped: "Lõpetatud",
    failed: "Ühendus ebaõnnestus",
  },
  share: "Ava arvutis",
  code: "Ülekande kood",
  copyLink: "Kopeeri vaatamislink",
  copied: "Link kopeeritud",
  expires: "Ülekanne suletakse hiljemalt kell",
  viewerTitle: "Vaata telefoni otsepilti",
  viewerIntro:
    "Vali käimasolev mäng või sisesta telefonis kuvatud kood. Sama ülekannet saab korraga vaadata mitu inimest.",
  startBroadcast: "Alusta telefonist",
  available: "Saadaval ülekanded",
  availableHint: "Nimekiri värskendub automaatselt.",
  noBroadcasts: "Praegu ei ole ühtegi aktiivset ülekannet.",
  refresh: "Värskenda",
  codeInput: "Ülekande kood",
  codeHint: "Kood on kaheksa märki, näiteks ABCD-EFGH.",
  codePlaceholder: "ABCD-EFGH",
  invalidCode: "Sisesta telefonis näidatud kaheksakohaline kood.",
  open: "Ava ülekanne",
  leave: "Sulge ülekanne",
  remoteVideo: "Mängu otsevideo",
  waitingVideo: "Ühendan otseülekandega…",
  playHelp: "Kui heli või video ei käivitu automaatselt, vajuta videol esitusnuppu.",
  live: "OTSE",
  preparing: "VALMISTUB",
  errors: {
    permission_denied: "Kaamera või mikrofoni luba ei antud. Luba need brauseri seadetes.",
    camera_not_found: "Telefon ei leidnud sobivat kaamerat või mikrofoni.",
    camera_busy: "Kaamerat kasutab teine rakendus. Sulge see ja proovi uuesti.",
    camera_interrupted: "Kaamera katkestas video. Ava leht uuesti ja proovi veel kord.",
    insecure_context: "Kaamera töötab ainult HTTPS-lehel.",
    unsupported_browser: "See brauser ei toeta vajalikku WebRTC ühendust.",
    invalid_access_key: "Ülekande võti on vale.",
    provider_unavailable: "Voogedastusteenus ei ole praegu saadaval. Proovi uuesti.",
    session_not_found: "Seda ülekannet ei leitud või see aegus.",
    broadcast_ended: "See ülekanne on lõppenud.",
    rate_limited: "Liiga palju katseid. Oota hetk ja proovi uuesti.",
    network: "Võrguühendus katkes. Kontrolli internetti ja proovi uuesti.",
    unexpected: "Ülekannet ei saanud avada. Proovi uuesti.",
  },
};

const en: LiveBroadcastCopy = {
  eyebrow: "Phone live stream",
  studioTitle: "Film the match with your phone",
  studioIntro:
    "Your phone sends its camera to LiveKit Cloud. Viewers open the RADA webpage and watch the same live feed in real time.",
  watch: "Watch broadcasts",
  managedTitle: "Vercel does not relay the video",
  managedBody:
    "Vercel handles broadcast creation and the viewing page. Video travels from the phone to the streaming service and from there to every viewer.",
  localPreview: "Phone camera preview",
  previewPlaceholder: "Your camera preview appears here after you start.",
  matchTitle: "Match name",
  matchTitlePlaceholder: "For example Kalev v Tartu",
  accessKey: "Broadcast key",
  accessKeyHint: "Use the PHONE_BROADCAST_ACCESS_KEY value configured in Vercel.",
  camera: "Camera",
  rearCamera: "Rear camera",
  frontCamera: "Front camera",
  start: "Allow camera and start",
  stop: "Stop broadcast",
  mute: "Mute microphone",
  unmute: "Turn microphone on",
  status: "Connection",
  phases: {
    idle: "Ready",
    requesting: "Requesting camera access",
    preparing: "Creating broadcast",
    waiting: "Waiting for service",
    connecting: "Connecting",
    live: "Live",
    stopped: "Stopped",
    failed: "Connection failed",
  },
  share: "Open on your computer",
  code: "Broadcast code",
  copyLink: "Copy viewing link",
  copied: "Link copied",
  expires: "The broadcast closes no later than",
  viewerTitle: "Watch the phone camera live",
  viewerIntro:
    "Choose a running match or enter the code shown on the phone. Multiple people can watch the same broadcast at once.",
  startBroadcast: "Start from phone",
  available: "Available broadcasts",
  availableHint: "This list refreshes automatically.",
  noBroadcasts: "There are no active broadcasts right now.",
  refresh: "Refresh",
  codeInput: "Broadcast code",
  codeHint: "The code has eight characters, for example ABCD-EFGH.",
  codePlaceholder: "ABCD-EFGH",
  invalidCode: "Enter the eight-character code shown on the phone.",
  open: "Open broadcast",
  leave: "Close broadcast",
  remoteVideo: "Live match video",
  waitingVideo: "Connecting to the live broadcast…",
  playHelp: "If audio or video does not start automatically, press play on the video.",
  live: "LIVE",
  preparing: "PREPARING",
  errors: {
    permission_denied:
      "Camera or microphone permission was denied. Allow them in browser settings.",
    camera_not_found: "The phone could not find a usable camera or microphone.",
    camera_busy: "Another app is using the camera. Close it and try again.",
    camera_interrupted: "The camera stopped sending video. Reopen the page and try again.",
    insecure_context: "Camera capture requires an HTTPS page.",
    unsupported_browser: "This browser does not support the required WebRTC connection.",
    invalid_access_key: "The broadcast key is incorrect.",
    provider_unavailable: "The streaming service is unavailable. Try again shortly.",
    session_not_found: "That broadcast was not found or has expired.",
    broadcast_ended: "That broadcast has ended.",
    rate_limited: "Too many attempts. Wait a moment and try again.",
    network: "The network connection failed. Check your internet and try again.",
    unexpected: "The broadcast could not be opened. Try again.",
  },
};

export function getLiveBroadcastCopy(locale: Locale): LiveBroadcastCopy {
  return locale === "et" ? et : en;
}
