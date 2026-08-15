import { notFound } from "next/navigation";
import { getBroadcastCopy } from "@/components/demo-broadcast/broadcast-copy";
import { BroadcastViewer } from "@/components/demo-broadcast/broadcast-viewer";
import { normalizeBroadcastCode } from "@/components/demo-broadcast/rtc";
import { getLiveBroadcastCopy } from "@/components/live-broadcast/live-broadcast-copy";
import { ManagedBroadcastViewer } from "@/components/live-broadcast/managed-broadcast-viewer";
import { isLocale } from "@/i18n/config";
import {
  getPhoneBroadcastProvider,
  isDemoBroadcastAvailable,
} from "@/server/demo-broadcast/availability";

export const dynamic = "force-dynamic";

export default async function BroadcastWatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ code?: string | string[] }>;
}) {
  const [{ locale: localeParam }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(localeParam)) notFound();
  if (!isDemoBroadcastAvailable()) notFound();

  const rawCode = typeof query.code === "string" ? query.code : "";
  const initialCode = normalizeBroadcastCode(rawCode) ?? "";
  if (getPhoneBroadcastProvider() === "livekit-cloud") {
    return (
      <ManagedBroadcastViewer
        locale={localeParam}
        copy={getLiveBroadcastCopy(localeParam)}
        initialCode={initialCode}
      />
    );
  }
  return (
    <BroadcastViewer
      locale={localeParam}
      copy={getBroadcastCopy(localeParam)}
      initialCode={initialCode}
    />
  );
}
