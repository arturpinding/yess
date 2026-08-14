import { notFound } from "next/navigation";
import { getBroadcastCopy } from "@/components/demo-broadcast/broadcast-copy";
import { BroadcastViewer } from "@/components/demo-broadcast/broadcast-viewer";
import { normalizeBroadcastCode } from "@/components/demo-broadcast/rtc";
import { isLocale } from "@/i18n/config";

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
  if (process.env.NODE_ENV === "production") notFound();

  const rawCode = typeof query.code === "string" ? query.code : "";
  const initialCode = normalizeBroadcastCode(rawCode) ?? "";
  return (
    <BroadcastViewer
      locale={localeParam}
      copy={getBroadcastCopy(localeParam)}
      initialCode={initialCode}
    />
  );
}
