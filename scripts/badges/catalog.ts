/**
 * Every image PR Guard puts in a GitHub comment. Adding a reviewer means adding one line to
 * REVIEWERS and running `npm run badges`.
 */

export type Tone = { id: string; label: string; icon: string; color: string };

export const SEVERITIES: Tone[] = [
  { id: "critical", label: "Critical", icon: "flame", color: "#FF5F57" },
  { id: "high", label: "High", icon: "triangle-alert", color: "#FF9147" },
  { id: "medium", label: "Medium", icon: "circle-alert", color: "#F2C14E" },
  { id: "low", label: "Low", icon: "info", color: "#8BB4F7" },
  { id: "nit", label: "Nit", icon: "message-square", color: "#A3AAB2" },
];

export const REVIEWERS: Tone[] = [
  { id: "general", label: "Bug", icon: "bug", color: "#B794F6" },
  { id: "security", label: "Security", icon: "shield-alert", color: "#FF79C6" },
  { id: "reliability", label: "Reliability", icon: "activity", color: "#56D364" },
  { id: "breaking", label: "Breaking change", icon: "unplug", color: "#FFA28B" },
  { id: "performance", label: "Performance", icon: "gauge", color: "#F9E2AF" },
  { id: "data", label: "Data", icon: "database", color: "#39C5CF" },
  { id: "slop", label: "AI slop", icon: "sparkles", color: "#D2A8FF" },
  { id: "rules", label: "Team rules", icon: "list-checks", color: "#A5D6FF" },
  { id: "supply-chain", label: "Supply chain", icon: "package", color: "#D4A373" },
  { id: "docs", label: "Docs drift", icon: "file-text", color: "#9DA5FF" },
  { id: "tests", label: "Test gap", icon: "flask-conical", color: "#7EE787" },
];

/** Business priority of a pull request: how soon a human should look at it. */
export const PRIORITIES: Tone[] = [
  { id: "p0", label: "Urgent", icon: "zap", color: "#FF5F57" },
  { id: "p1", label: "High priority", icon: "chevrons-up", color: "#FF9147" },
  { id: "p2", label: "Normal", icon: "equal", color: "#8BB4F7" },
  { id: "p3", label: "Low priority", icon: "chevron-down", color: "#A3AAB2" },
];

export const RISKS: Tone[] = [
  { id: "low", label: "Low risk", icon: "shield-check", color: "#56D364" },
  { id: "medium", label: "Medium risk", icon: "shield", color: "#F2C14E" },
  { id: "high", label: "High risk", icon: "shield-alert", color: "#FF5F57" },
];

export const STATUSES: Tone[] = [
  { id: "fixed", label: "Fixed", icon: "circle-check", color: "#56D364" },
  { id: "new", label: "New", icon: "circle-plus", color: "#2ECEDD" },
  { id: "open", label: "Open", icon: "circle-dashed", color: "#F2C14E" },
  { id: "learned", label: "Learning saved", icon: "brain", color: "#D2A8FF" },
];

export const VERIFIED: Tone = { id: "verified", label: "Verified", icon: "badge-check", color: "#2ECEDD" };

/** Severity and status counts are baked into the image up to this number; above it the text says "20+". */
export const MAX_COUNT = 20;

export type Item = { name: string; alt: string; html: string };
