import { countryName, flagEmoji, phoneCountry } from "@/lib/phoneCountry";

/** Drapeau du pays déduit de l'indicatif du numéro (rien si inconnu). */
export function PhoneFlag({ phone }: { phone: string | undefined | null }) {
  const iso = phoneCountry(phone);
  if (!iso) return null;
  const name = countryName(iso);
  return (
    <span role="img" aria-label={name} title={name} className="mr-1.5 inline-block leading-none">
      {flagEmoji(iso)}
    </span>
  );
}
