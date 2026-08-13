import { notFound } from "next/navigation";
import { MarkBoard } from "@/components/MarkBoard";
import { isAdminUnlocked } from "@/lib/admin";
import { getShowPublic } from "@/lib/store";

export default async function ShowPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const show = await getShowPublic(token);
  if (!show) notFound();
  const admin = await isAdminUnlocked(token);

  return (
    <main>
      <MarkBoard token={token} initialShow={show} initialAdmin={admin} />
    </main>
  );
}
