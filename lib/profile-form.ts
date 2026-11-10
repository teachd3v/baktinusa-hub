import { emptyProfile, type ProfileInput } from "./data/profiles.ts";

// Mengubah FormData menjadi masukan profil. Dipakai server action awardee dan Admin supaya keduanya membaca form yang sama.
// Isi tidak divalidasi di sini; validateProfile() di lapisan data yang memutuskan.

const text = (form: FormData, name: string) => String(form.get(name) ?? "");
const splitList = (raw: string) => raw.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);

export function profileFromForm(form: FormData): ProfileInput {
  const profile = emptyProfile();
  for (const key of Object.keys(profile) as (keyof ProfileInput)[]) {
    if (key === "interests" || key === "skills" || key === "languages") continue;
    (profile as Record<string, unknown>)[key] = text(form, key);
  }
  profile.interests = [...form.getAll("interests").map(String), ...splitList(text(form, "interestsExtra"))];
  profile.skills = splitList(text(form, "skills"));
  profile.languages = splitList(text(form, "languages"));
  return profile;
}

