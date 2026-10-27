// Konfigurasi pertanyaan non-skor per periode (kolom periods.form_config).

export type FeedbackField = "saran_diri" | "saran_program" | "pesan" | "kritik" | "saran_keberlanjutan";

export type FeedbackItem = { field: FeedbackField; label: string; question: string; required: boolean };

export type ScaleOption = { value: number; label: string; emoji: string };

export type FormConfig = {
  title: string;
  subtitle?: string;
  identity: { name: string; city: string };
  // `type` dulu memilih respondent_type dari pilihan hubungan. Sejak migrasi 0008 jenis penilaian
  // ditentukan oleh form yang dibuka, bukan oleh jawaban pengisi, jadi tidak ada lagi yang membacanya —
  // opsional supaya konfigurasi baru tidak perlu mengarang nilai yang tak berarti.
  relation: { question: string; options: { label: string; type?: string; detail?: string }[] };
  knownDuration?: { question: string; options: string[] };
  feedback: FeedbackItem[];
  scale: ScaleOption[];
  // Asesmen mandiri: pertanyaan saran versi "Anda", bukan "yang bersangkutan".
  self?: { title?: string; feedback?: FeedbackItem[] };
};

export const parseFormConfig = (json: string | null): FormConfig | null => (json ? (JSON.parse(json) as FormConfig) : null);
