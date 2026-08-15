import { notFound } from "next/navigation";
import { BroadcastStudio } from "@/components/demo-broadcast/broadcast-studio";
import { getBroadcastCopy } from "@/components/demo-broadcast/broadcast-copy";
import { getLiveBroadcastCopy } from "@/components/live-broadcast/live-broadcast-copy";
import { ManagedBroadcastStudio } from "@/components/live-broadcast/managed-broadcast-studio";
import { isLocale } from "@/i18n/config";
import {
  getPhoneBroadcastProvider,
  isDemoBroadcastAvailable,
} from "@/server/demo-broadcast/availability";

export const dynamic = "force-dynamic";

export default async function BroadcastPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  if (!isLocale(localeParam)) notFound();
  if (!isDemoBroadcastAvailable()) notFound();

  if (getPhoneBroadcastProvider() === "livekit-cloud") {
    return <ManagedBroadcastStudio locale={localeParam} copy={getLiveBroadcastCopy(localeParam)} />;
  }

  return <BroadcastStudio locale={localeParam} copy={getBroadcastCopy(localeParam)} />;
}
