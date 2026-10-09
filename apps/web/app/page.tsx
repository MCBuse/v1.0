import { Benefits } from "../components/landing/Benefits";
import { Footer } from "../components/landing/Footer";
import { Hero } from "../components/landing/Hero";
import { HowItWorks } from "../components/landing/HowItWorks";
import { Nav } from "../components/landing/Nav";
import { PilotFocus } from "../components/landing/PilotFocus";
import { Problem } from "../components/landing/Problem";
import { Solution } from "../components/landing/Solution";

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Problem />
        <Solution />
        <Benefits />
        <HowItWorks />
        <PilotFocus />
      </main>
      <Footer />
    </>
  );
}
