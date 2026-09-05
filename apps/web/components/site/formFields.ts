export type FieldType = "text" | "email" | "tel" | "select" | "textarea" | "yesno";

export type Field = {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  optional?: boolean;
  options?: readonly string[];
};

export type Segment = {
  id: string;
  hash: string;
  label: string;
  subject: string;
  submitLabel: string;
  consent: string;
  fields: readonly Field[];
};

/** Field sets per handover §7.2. Shared names (name, email) survive a switch. */
export const SEGMENTS: readonly Segment[] = [
  {
    id: "merchant",
    hash: "merchant-form",
    label: "Merchant pilot",
    subject: "MCBuse merchant pilot application",
    submitLabel: "Submit pilot application",
    consent:
      "I consent to MCBuse processing this information for pilot evaluation. I can withdraw consent at any time.",
    fields: [
      { name: "name", label: "Your name", type: "text", required: true },
      { name: "business", label: "Business name", type: "text", required: true },
      {
        name: "city",
        label: "Target city",
        type: "select",
        required: true,
        options: ["Berlin", "Munich", "Elsewhere"],
      },
      { name: "email", label: "Contact email", type: "email", required: true },
      { name: "phone", label: "Contact phone", type: "tel", optional: true },
      { name: "qrnfc", label: "Interested in QR or NFC payments?", type: "yesno", required: true },
      { name: "message", label: "Anything else we should know?", type: "textarea", optional: true },
    ],
  },
  {
    id: "partner",
    hash: "partner-form",
    label: "Partner enquiry",
    subject: "MCBuse partner discovery call",
    submitLabel: "Request a discovery call",
    consent:
      "I consent to MCBuse processing this business contact information for partnership discussions.",
    fields: [
      { name: "name", label: "Your name", type: "text", required: true },
      { name: "company", label: "Company or institution", type: "text", required: true },
      { name: "role", label: "Role or title", type: "text", required: true },
      { name: "email", label: "Corporate email", type: "email", required: true },
      {
        name: "partnerType",
        label: "Partner type",
        type: "select",
        required: true,
        options: ["Bank", "Fintech", "PSP", "Investor", "Other"],
      },
      {
        name: "goals",
        label: "Core integration goals",
        type: "textarea",
        required: true,
      },
    ],
  },
  {
    id: "waitlist",
    hash: "waitlist-form",
    label: "General waitlist",
    subject: "MCBuse waitlist",
    submitLabel: "Join the waitlist",
    consent: "I consent to MCBuse sending me product updates. I can unsubscribe at any time.",
    fields: [
      { name: "name", label: "Your name", type: "text", required: true },
      { name: "email", label: "Email", type: "email", required: true },
      {
        name: "iam",
        label: "I am a",
        type: "select",
        required: true,
        options: ["Merchant", "Partner", "Investor", "Developer", "Other"],
      },
    ],
  },
];

/** Validation copy — exact strings from handover §7.2. */
export const VALIDATION = {
  required: "This field is required.",
  email: "Enter a valid email address.",
  workEmail: "Please use your work email address.",
  phone: "Enter a valid phone number, or leave this blank.",
  consent: "We need your consent to process this.",
  select: "Choose an option.",
} as const;

const FREE_EMAIL = /@(gmail|googlemail|yahoo|hotmail|outlook|live|icloud|proton(mail)?|gmx|web)\./i;

export function isFreeEmail(value: string) {
  return FREE_EMAIL.test(value);
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

export function isValidPhone(value: string) {
  return value.trim().length === 0 || /^[+()\d\s-]{6,}$/.test(value);
}
