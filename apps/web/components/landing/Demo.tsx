import {
  EXTERNAL_LINKS,
  hasConfiguredUrl,
  linkOrRequestAccess,
} from "./constants";
import { SandboxPreview } from "./DashboardMock";
import { Section } from "./Section";

export function Demo() {
  const pitchHref = linkOrRequestAccess(
    EXTERNAL_LINKS.pitchVideo,
    "Request MCBuse pitch video access",
  );
  const demoHref = linkOrRequestAccess(
    EXTERNAL_LINKS.demoVideo,
    "Request MCBuse demo video access",
  );
  const apkHref = linkOrRequestAccess(
    EXTERNAL_LINKS.apk,
    "Request MCBuse APK access",
  );

  return (
    <Section
      id="demo"
      eyebrow="Sandbox demo"
      title="Explore the Sandbox Demo"
      intro="The current sandbox demo was prepared for the Colosseum Frontier Hackathon to show the basic payment flow and how MCBuse could work in practice."
    >
      <SandboxPreview
        pitchHref={pitchHref}
        demoHref={demoHref}
        apkHref={apkHref}
        pitchLabel={
          hasConfiguredUrl(EXTERNAL_LINKS.pitchVideo)
            ? "Watch Pitch Video"
            : "Request Pitch Video"
        }
        demoLabel={
          hasConfiguredUrl(EXTERNAL_LINKS.demoVideo)
            ? "Watch Demo Video"
            : "Request Demo Video"
        }
        apkLabel={hasConfiguredUrl(EXTERNAL_LINKS.apk) ? "Test APK" : "Request APK"}
      />

      <div className="mt-5 rounded-lg border border-warning bg-warning-soft p-5">
        <p className="text-sm font-semibold text-warning">
          Sandbox Status: The current demo is for testing, validation, and
          product demonstration. It is not a full production release.
        </p>
      </div>
    </Section>
  );
}
