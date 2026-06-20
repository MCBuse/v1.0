import { BusinessModel, EcosystemValidation, WhyBlockchain } from "../components/landing/Business";
import { ProductStack } from "../components/landing/Benefits";
import { Demo } from "../components/landing/Demo";
import { FinalCta } from "../components/landing/FinalCta";
import { Footer } from "../components/landing/Footer";
import { Hero } from "../components/landing/Hero";
import { WhyStarted } from "../components/landing/HowItWorks";
import { Nav } from "../components/landing/Nav";
import { AudienceSections, MarketEntry } from "../components/landing/PilotFocus";
import { Problem } from "../components/landing/Problem";
import { Solution } from "../components/landing/Solution";
import { TeamAndRoadmap } from "../components/landing/TeamRoadmap";

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <WhyStarted />
        <Problem />
        <Solution />
        <ProductStack />
        <Demo />
        <AudienceSections />
        <MarketEntry />
        <WhyBlockchain />
        <BusinessModel />
        <EcosystemValidation />
        <TeamAndRoadmap />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
