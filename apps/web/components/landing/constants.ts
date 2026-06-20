export const CONTACT_EMAIL = "hello@mcbuse.com";

export const EXTERNAL_LINKS = {
  pilot: "https://tally.so/r/mcbuse-pilot",
  partnerCall: "",
  waitlist: "",
  pitchVideo: "",
  demoVideo: "",
  apk: "",
  pitchDeck: "",
  contact: `mailto:${CONTACT_EMAIL}`,
};

export type TeamMember = {
  name: string;
  role: string;
  education: string;
  experience: string;
  linkedin?: string;
};

export const TEAM_MEMBERS: TeamMember[] = [
  {
    name: "Asim Emre Aci",
    role: "Team Leader",
    education: "MSc - University of Europe for Applied Sciences",
    experience: "Finance & IT",
  },
  {
    name: "Frederick Obeng Nyarko",
    role: "Engineering Lead",
    education: "MSc - KNUST",
    experience: "Software Engineering",
  },
  {
    name: "Berk Ozkan",
    role: "Marketing Lead",
    education: "MSc - University of Europe for Applied Sciences",
    experience: "EdTech & Growth",
  },
];

export function mailto(subject: string, body?: string) {
  const params = new URLSearchParams({ subject });

  if (body) {
    params.set("body", body);
  }

  return `mailto:${CONTACT_EMAIL}?${params.toString()}`;
}

export function linkOrRequestAccess(url: string, subject: string) {
  if (url.trim().length > 0) {
    return url;
  }

  return mailto(
    subject,
    "Hello MCBuse team,\n\nPlease send me access to this material.\n\nThanks.",
  );
}

export function hasConfiguredUrl(url: string) {
  return url.trim().length > 0;
}

export function outboundProps(href: string) {
  if (!href.startsWith("http")) {
    return {};
  }

  return {
    target: "_blank",
    rel: "noopener noreferrer",
  };
}
