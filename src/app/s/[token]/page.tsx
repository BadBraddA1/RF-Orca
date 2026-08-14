import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { MarkBoard } from "@/components/MarkBoard"
import { isAdminUnlocked } from "@/lib/admin"
import { siteName, siteUrl } from "@/lib/site-metadata"
import { getShowPublic } from "@/lib/store"

type PageProps = {
  params: Promise<{ token: string }>
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { token } = await params
  const show = await getShowPublic(token)
  if (!show) {
    return {
      title: "Show not found",
      description: `${siteName} mark board`,
    }
  }

  const total = show.channels.length
  const deployed = show.channels.filter((c) => c.deployed).length
  const description =
    total === 0
      ? `Mark board on ${siteName} — import channels and track deploy.`
      : `${deployed} of ${total} channels deployed · ${siteName} mark board`

  const title = `${show.name} · ${siteName}`
  const url = `${siteUrl}/s/${token}`

  return {
    title: show.name,
    description,
    openGraph: {
      title,
      description,
      url,
      type: "website",
      siteName,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  }
}

export default async function ShowPage({ params }: PageProps) {
  const { token } = await params
  const show = await getShowPublic(token)
  if (!show) notFound()
  const admin = await isAdminUnlocked(token)

  return (
    <main>
      <MarkBoard token={token} initialShow={show} initialAdmin={admin} />
    </main>
  )
}
