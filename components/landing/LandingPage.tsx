import { Hero } from "./Hero";
import { WhatIsAnalix } from "./WhatIsAnalix";
import { HowItWorks } from "./HowItWorks";
import { DataPractices } from "./DataPractices";
import { LandingCTA } from "./LandingCTA";

/**
 * Full landing document shown while no data is loaded: the untouched Hero plus
 * the "electric editorial" continuation (what it is → how it works → data
 * practices → CTA). `#top` anchors the closing CTA back to the hero dropzone;
 * smooth scroll only when motion is allowed.
 */
export function LandingPage() {
  return (
    <div id="top" className="flex flex-col">
      <Hero />
      <WhatIsAnalix />
      <HowItWorks />
      <DataPractices />
      <LandingCTA />
    </div>
  );
}
