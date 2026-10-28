/** Propriétaires du CRM : toujours admins, quel que soit le contenu de la base. */
export const CRM_ADMINS = [
  "gerardraphael01@gmail.com",
  "raphael.gerard@nexstun.com",
  "laurent.mollinari@nexstun.com",
];

export function isOwnerEmail(email: string | null | undefined): boolean {
  return CRM_ADMINS.map((e) => e.toLowerCase()).includes((email ?? "").toLowerCase());
}

/** Comptes créés avant cette date : membres d'office (l'équipe existante). Les suivants doivent être ajoutés par un admin. */
export const MEMBERS_CUTOFF = "2026-10-28T14:00:00.000Z";
