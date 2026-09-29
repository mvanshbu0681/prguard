// OWNER: T0 (wave 0). FROZEN once T0 merges.
//
// The marketing page is a fixed composition of sections (D2, plan T8), in this
// order, each changing exactly one belief; 01b (the launch film) was added after
// the hero on 2026-09-28. Each section lives in its own
// file under ./_sections and is owned by one wave-3 builder, so nobody edits
// this file: a section that needs something changes inside its own file.
// The <main> landmark belongs to app/(marketing)/layout.tsx.
import { Hero } from "./_sections/01-hero";
import { Film } from "./_sections/01b-film";
import { Negation } from "./_sections/02-negation";
import { WeWereWrong } from "./_sections/03-we-were-wrong";
import { WhatLandsInYourPR } from "./_sections/04-what-lands";
import { InstrumentFace } from "./_sections/05-instrument";
import { Pipeline } from "./_sections/06-pipeline";
import { IdentityRecorder } from "./_sections/07-record";
import { AccuracyReport } from "./_sections/08-accuracy";
import { Close } from "./_sections/09-close";

export default function MarketingPage() {
  return (
    <>
      <Hero />
      <Film />
      <Negation />
      <WeWereWrong />
      <WhatLandsInYourPR />
      <InstrumentFace />
      <Pipeline />
      <IdentityRecorder />
      <AccuracyReport />
      <Close />
    </>
  );
}
