import { mailto } from "../landing/constants";

export type IntakeField = { label: string; value: string };

/**
 * Interim submission path.
 *
 * There is no backend endpoint and no form service configured, so rather than
 * fake a success state we compose a pre-filled mail draft carrying every field
 * AND the exact consent string that was shown. Same degradation philosophy as
 * `linkOrRequestAccess()` in ../landing/constants.
 *
 * TO REPLACE: swap the body of this function for a server action that POSTs to
 * apps/api and persists { fields, consentText, consentedAt }. Nothing else in
 * the form needs to change.
 */
export function buildIntakeMailto({
  subject,
  fields,
  consentText,
}: {
  subject: string;
  fields: IntakeField[];
  consentText: string;
}): string {
  const lines = fields
    .filter((f) => f.value.trim().length > 0)
    .map((f) => `${f.label}: ${f.value.trim()}`);

  const body = [
    ...lines,
    "",
    "— Consent —",
    consentText,
    `Agreed at: ${new Date().toISOString()}`,
  ].join("\n");

  return mailto(subject, body);
}
