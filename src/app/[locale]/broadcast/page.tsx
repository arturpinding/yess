import { notFound } from "next/navigation";
import { BroadcastStudio } from "@/components/demo-broadcast/broadcast-studio";
import { getBroadcastCopy } from "@/components/demo-broadcast/broadcast-copy";
import { isLocale } from "@/i18n/config";

export const dynamic = "force-dynamic";

export default async function BroadcastPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  if (!isLocale(localeParam)) notFound();
  // The direct-device broadcaster remains a development demo until production
  // identity, moderation and owned ICE infrastructure are connected.
  if (process.env.NODE_ENV === "production") notFound();

  return <BroadcastStudio locale={localeParam} copy={getBroadcastCopy(localeParam)} />;
}
