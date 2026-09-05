import { CtaStrip } from "../components/site/CtaStrip";
import { HashRedirect } from "../components/site/HashRedirect";
import { Hero } from "../components/home/Hero";
import {
  AudienceSplit,
  BoundaryBand,
  Problem,
  Solution,
  ValueSnapshot,
} from "../components/home/sections";

export default function Home() {
  return (
    <>
      <HashRedirect />
      <Hero />
      <AudienceSplit />
      <Problem />
      <Solution />
      <ValueSnapshot />
      <BoundaryBand />
      <CtaStrip
        title="Help build financial visibility for micro-merchants"
        body="We are talking to merchants, banks, fintechs, payment service providers and investors."
        primary={{ label: "Join the Pilot", href: "/contact#merchant-form" }}
        secondary={{ label: "Schedule a partner call", href: "/contact#partner-form" }}
      />
    </>
  );
}
