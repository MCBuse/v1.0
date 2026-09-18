import { redirect } from "next/navigation";

type SearchParams = Record<string, string | string[] | undefined>;

export function redirectMerchantBookmark(
  destination: string,
  searchParams: SearchParams,
): never {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") query.set(key, value);
    else for (const entry of value ?? []) query.append(key, entry);
  }
  const serialized = query.toString();
  redirect(serialized ? `${destination}?${serialized}` : destination);
}
