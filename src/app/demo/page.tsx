import type { Metadata } from "next"
import { DemoBoard } from "@/components/DemoBoard"
import { siteName } from "@/lib/site-metadata"

export const metadata: Metadata = {
  title: "Demo",
  description: `Watch a simulated ${siteName} show — deploys, progress, activity, and conflict checks with fake floor traffic.`,
}

export default function DemoPage() {
  return (
    <main>
      <DemoBoard />
    </main>
  )
}
