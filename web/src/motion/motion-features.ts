// OWNER: T3 (wave 1). The deferred Motion feature bundle (~15 KB gz), loaded by
// <MotionProvider> after first render so the dashboard shell pays ~4.6 KB up front
// (motion spec §3.1). Dashboard-only. Import only through src/motion/motion.tsx.
import { domAnimation } from "motion/react";

export default domAnimation;
