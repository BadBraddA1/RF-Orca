"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { BrandLockup } from "@/components/BrandLockup"
import {
  buildDemoBeats,
  buildDemoShow,
  type DemoBeat,
} from "@/lib/demo-show"
import type { Channel, ShowPublic } from "@/lib/types"

function formatAgo(iso: string): string {
  const ms = Date.now() - Date.parse(iso)
  if (!Number.isFinite(ms) || ms < 45_000) return "now"
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m`
}

export function DemoBoard() {
  const [show, setShow] = useState<ShowPublic>(() => buildDemoShow())
  const [beatIndex, setBeatIndex] = useState(-1)
  const [playing, setPlaying] = useState(true)
  const [caption, setCaption] = useState("Demo ready — watch the floor move")
  const [runId, setRunId] = useState(0)
  const timers = useRef<number[]>([])
  const beats = useMemo(() => buildDemoBeats(), [])

  useEffect(() => {
    timers.current.forEach((id) => window.clearTimeout(id))
    timers.current = []
    if (!playing) return

    let showState = buildDemoShow()
    setShow(showState)
    setBeatIndex(-1)
    setCaption("Imported Workbench plan — crews start marking")

    let elapsed = 600
    beats.forEach((beat: DemoBeat, index: number) => {
      elapsed += beat.delayMs
      const id = window.setTimeout(() => {
        showState = beat.run(showState)
        setShow({ ...showState })
        setBeatIndex(index)
        setCaption(beat.label)
      }, elapsed)
      timers.current.push(id)
    })

    const doneAt = elapsed + 1800
    const doneId = window.setTimeout(() => {
      setCaption("Demo complete — replay or start a real show")
      setPlaying(false)
    }, doneAt)
    timers.current.push(doneId)

    return () => {
      timers.current.forEach((id) => window.clearTimeout(id))
      timers.current = []
    }
  }, [beats, playing, runId])

  const counts = useMemo(() => {
    const all = show.channels.length
    const deployed = show.channels.filter((c) => c.deployed).length
    return { all, deployed, pct: all ? Math.round((deployed / all) * 100) : 0 }
  }, [show.channels])

  const sections = useMemo(() => {
    const map = new Map<string, Channel[]>()
    for (const ch of show.channels) {
      const key = ch.groupName || "Ungrouped"
      const list = map.get(key) ?? []
      list.push(ch)
      map.set(key, list)
    }
    return show.groups
      .map((g) => ({ name: g.name, channels: map.get(g.name) ?? [] }))
      .filter((s) => s.channels.length > 0)
  }, [show])

  function replay() {
    setPlaying(true)
    setRunId((n) => n + 1)
  }

  return (
    <div className="board demo-board">
      <div className="demo-banner" role="status">
        <div>
          <strong>Live product demo</strong>
          <span> — simulated Ballroom Saturday. Nothing is saved.</span>
        </div>
        <div className="demo-banner-actions">
          <button type="button" className="btn-quiet" onClick={replay}>
            Replay
          </button>
          <Link href="/" className="btn-secondary">
            Create a real show
          </Link>
        </div>
      </div>

      <header className="board-header">
        <div>
          <BrandLockup size="header" showTagline />
          <h1>{show.name}</h1>
          <p className="board-sub">
            Tap Deploy, set the room.
            <span className="live-pill on">Live · demo</span>
          </p>
        </div>
        <div className="board-actions">
          <span className="demo-caption">{caption}</span>
        </div>
      </header>

      <div className="progress-hud" role="status">
        <div className="progress-hud-top">
          <strong>
            {counts.deployed}/{counts.all} deployed
          </strong>
          <span>{counts.pct}%</span>
        </div>
        <div className="progress-track" aria-hidden>
          <div
            className="progress-fill"
            style={{ transform: `scaleX(${counts.pct / 100})` }}
          />
        </div>
        <div className="progress-groups">
          {show.groups.map((g) => {
            const list = show.channels.filter((c) => c.groupName === g.name)
            const deployed = list.filter((c) => c.deployed).length
            return (
              <span key={g.id}>
                {g.name} {deployed}/{list.length}
                {list.length > 0 && deployed === list.length ? " ✓" : ""}
              </span>
            )
          })}
        </div>
      </div>

      {show.features.crewLocked ? (
        <div className="board-banner locked" role="status">
          Board locked for crew — marking paused.
        </div>
      ) : null}

      {(show.conflicts?.length ?? 0) > 0 ? (
        <div className="board-banner conflict" role="alert">
          <strong>Frequency conflict</strong>
          {show.conflicts.map((c) => (
            <span key={c.frequencyMhz}>
              {" "}
              · {c.frequencyMhz.toFixed(3)} MHz (
              {c.channels.map((ch) => ch.name).join(" + ")})
            </span>
          ))}
        </div>
      ) : null}

      {(show.activity?.length ?? 0) > 0 ? (
        <div className="activity-strip" aria-label="Recent activity">
          {show.activity.slice(0, 6).map((a) => (
            <div key={a.id} className="activity-item">
              <span className="activity-msg">{a.message}</span>
              <span className="activity-time">{formatAgo(a.at)}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="demo-timeline" aria-hidden>
        {beats.map((b, i) => (
          <span
            key={b.label}
            className={`demo-dot${i <= beatIndex ? " on" : ""}`}
            title={b.label}
          />
        ))}
      </div>

      <div className="group-sections">
        {sections.map((section) => (
          <section key={section.name} className="group-section">
            <div className="group-heading-row">
              <h2 className="group-heading">
                {section.name}
                <span className="group-count">{section.channels.length}</span>
              </h2>
            </div>
            <ul className="channel-list">
              {section.channels.map((channel) => {
                const conflicted = show.conflicts?.some((c) =>
                  c.channels.some((x) => x.id === channel.id),
                )
                return (
                  <li
                    key={channel.id}
                    className={`channel-row status-${channel.status}${channel.deployed ? " is-deployed" : ""}${conflicted ? " is-conflict" : ""}`}
                  >
                    <div className="channel-top-row">
                      <div className="channel-main">
                        <div className="channel-title">
                          <strong>{channel.name}</strong>
                          <span className="freq">
                            {channel.band ? (
                              <span className="band-tag">{channel.band}</span>
                            ) : null}
                            {channel.band ? " · " : ""}
                            {channel.frequencyMhz.toFixed(3)} MHz
                          </span>
                        </div>
                        {channel.assignedTo ? (
                          <p className="channel-who">
                            {channel.assignedTo} has {channel.name}
                          </p>
                        ) : null}
                        <div className="channel-meta">
                          {channel.rackSlot != null ? (
                            <span>
                              CH {String(channel.rackSlot).padStart(2, "0")}
                            </span>
                          ) : null}
                          {channel.groupChannel ? (
                            <span>G/Ch {channel.groupChannel}</span>
                          ) : null}
                          {channel.isBackup ? (
                            <span className="tag">Backup</span>
                          ) : null}
                          <span className={`tag status-${channel.status}`}>
                            {channel.status}
                          </span>
                          {channel.inUse ? (
                            <span className="tag">In use</span>
                          ) : (
                            <span className="tag">Not in use</span>
                          )}
                          {channel.deployed && channel.roomName ? (
                            <span className="tag deployed-room">
                              {channel.roomName}
                            </span>
                          ) : null}
                          {conflicted ? (
                            <span className="tag conflict-tag">Conflict</span>
                          ) : null}
                        </div>
                      </div>
                      <button
                        type="button"
                        className={`deploy-btn${channel.deployed ? " on" : ""}${channel.status === "blocked" || show.features.crewLocked ? " disabled" : ""}`}
                        disabled
                        aria-pressed={channel.deployed}
                      >
                        {channel.deployed ? "Deployed" : "Deploy"}
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
