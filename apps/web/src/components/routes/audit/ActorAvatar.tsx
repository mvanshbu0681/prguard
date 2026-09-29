// Who acted, told apart by SHAPE as well as colour: a person is a round initials
// avatar; Witness itself is an ink squircle carrying the eye; the pipeline,
// the gate, the proof runner and the webhook are quiet grey squircles with a glyph.
import type { LucideIcon } from "lucide-react";
import { Cog, FlaskConical, KeyRound, ShieldCheck, Timer, Webhook, Workflow } from "lucide-react";
import { Mark } from "@/components/brand";
import { Avatar } from "@/components/dash/kit";
import { cn } from "@/lib/utils";
import type { ActorView } from "./audit-model";
import s from "./audit.module.css";

const GLYPH: Record<ActorView["glyph"], LucideIcon> = {
  webhook: Webhook,
  pipeline: Workflow,
  gate: ShieldCheck,
  proof: FlaskConical,
  reaper: Timer,
  api: KeyRound,
  system: Cog,
};

export function ActorAvatar({ actor, size = 32, className }: { actor: ActorView; size?: number; className?: string }) {
  const label = actor.detail ? `${actor.name} (${actor.detail})` : actor.name;
  if (actor.kind === "human" && actor.glyph !== "api") {
    return <Avatar name={actor.name} size={size} className={className} title={label} />;
  }
  if (actor.kind === "witness") {
    return (
      <span className={cn(s.actorWitness, className)} style={{ width: size, height: size }} title={label} data-actor="witness">
        <Mark size={Math.round(size * 0.62)} tone="signal" />
      </span>
    );
  }
  const Glyph = GLYPH[actor.glyph];
  return (
    <span className={cn(s.actorSystem, actor.glyph === "api" && s.actorApi, className)} style={{ width: size, height: size }} title={label} data-actor={actor.kind}>
      <Glyph size={Math.round(size * 0.47)} strokeWidth={1.8} aria-hidden />
    </span>
  );
}
