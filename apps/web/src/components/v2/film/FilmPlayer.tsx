"use client";
// The film's player. Muted autoplay only while at least 40% of it is on screen
// (browsers allow muted autoplay; sound is one click away and restarts the film
// so the score is heard from the top). It pauses when scrolled away, never
// autoplays under reduced motion, and always offers pause (WCAG 2.2.2).
// Progress and the active chapter follow the video's own clock.
import { useEffect, useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import { prefersReducedMotion } from "@/components/brand/live-favicon";
import s from "./film.module.css";

export interface FilmChapter {
  /** Start and end in seconds. */
  at: number;
  end: number;
  label: string;
  index: string;
}

interface FilmPlayerProps {
  src: string;
  /** A lighter encode for narrow screens. */
  srcSmall?: string;
  poster: string;
  chapters: FilmChapter[];
  /** Accessible description of the film. */
  label: string;
  className?: string;
}

const fmt = (t: number) => `0:${String(Math.floor(t)).padStart(2, "0")}`;

export function FilmPlayer({ src, srcSmall, poster, chapters, label, className }: FilmPlayerProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const userPaused = useRef(false);
  const activeRef = useRef(-1);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [active, setActive] = useState(-1);
  const [reduced, setReduced] = useState(false);

  // autoplay while in view
  useEffect(() => {
    const v = videoRef.current;
    const box = boxRef.current;
    if (!v || !box) return;
    const still = prefersReducedMotion();
    setReduced(still);
    if (still) return;
    let started = false;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.4) {
          if (!started) {
            started = true;
            v.currentTime = 0;
          }
          if (!userPaused.current) v.play().catch(() => {});
        } else if (!v.paused) {
          v.pause();
        }
      },
      { threshold: [0, 0.4, 0.8] },
    );
    io.observe(box);
    return () => io.disconnect();
  }, []);

  // progress line + active chapter, on the video's clock while it plays
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let raf = 0;
    const tick = () => {
      const d = v.duration || 15;
      const t = v.currentTime;
      if (barRef.current) barRef.current.style.transform = `scaleX(${Math.min(1, t / d).toFixed(4)})`;
      const i = chapters.findIndex((c) => t >= c.at && t < c.end);
      if (i !== activeRef.current) {
        activeRef.current = i;
        setActive(i);
      }
      raf = v.paused ? 0 : requestAnimationFrame(tick);
    };
    const onPlay = () => {
      setPlaying(true);
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const onPause = () => {
      setPlaying(false);
      tick();
    };
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("seeked", tick);
    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("seeked", tick);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [chapters]);

  const play = () => {
    const v = videoRef.current;
    if (!v) return;
    userPaused.current = false;
    v.play().catch(() => {});
  };
  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) play();
    else {
      userPaused.current = true;
      v.pause();
    }
  };
  const toggleSound = () => {
    const v = videoRef.current;
    if (!v) return;
    const next = !v.muted;
    v.muted = next;
    setMuted(next);
    if (!next) {
      if (v.currentTime > 1) v.currentTime = 0;
      play();
    }
  };
  const seek = (c: FilmChapter) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = c.at;
    play();
  };

  return (
    <div className={className}>
      <div ref={boxRef} className={s.frame}>
        <video
          ref={videoRef}
          className={s.video}
          poster={poster}
          muted
          loop
          playsInline
          preload="metadata"
          aria-label={label}
        >
          {srcSmall ? <source src={srcSmall} type="video/mp4" media="(max-width: 720px)" /> : null}
          <source src={src} type="video/mp4" />
        </video>

        {reduced && !playing ? (
          <button type="button" className={s.bigPlay} onClick={play} aria-label="Play the film">
            <span className={s.bigPlayChip} aria-hidden>
              <Play size={26} strokeWidth={2} />
            </span>
            Play the film
          </button>
        ) : null}

        <div className={s.controls}>
          <button type="button" className={s.ctrl} onClick={toggleSound} aria-pressed={!muted} aria-label={muted ? "Turn sound on" : "Turn sound off"}>
            {muted ? <VolumeX size={16} strokeWidth={2} aria-hidden /> : <Volume2 size={16} strokeWidth={2} aria-hidden />}
            <span className={s.ctrlText}>{muted ? "Sound off" : "Sound on"}</span>
          </button>
          <button type="button" className={`${s.ctrl} ${s.round}`} onClick={togglePlay} aria-label={playing ? "Pause the film" : "Play the film"}>
            {playing ? <Pause size={16} strokeWidth={2} aria-hidden /> : <Play size={16} strokeWidth={2} aria-hidden />}
          </button>
        </div>
        <span className={s.track} aria-hidden>
          <span ref={barRef} className={s.bar} />
        </span>
      </div>

      <ol className={s.chapters} aria-label="Chapters">
        {chapters.map((c, i) => (
          <li key={c.index}>
            <button type="button" className={s.chapter} data-active={i === active ? "" : undefined} aria-current={i === active ? "true" : undefined} onClick={() => seek(c)}>
              <span className={s.chapterIndex}>{c.index}</span>
              <span className={s.chapterLabel}>{c.label}</span>
              <span className={s.chapterTime}>{fmt(c.at)}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
