"use client";

interface Props {
  label?: string;
}

/** Marks synthetic demo data. Flat, square, text first. */
export default function DemoBanner({ label = "Synthetic demo" }: Props) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 text-[0.78rem] font-semibold border"
      style={{
        borderRadius: 2,
        background: "color-mix(in srgb, var(--color-haldi) 14%, var(--color-surface))",
        borderColor: "color-mix(in srgb, var(--color-haldi) 60%, var(--color-line))",
        color: "color-mix(in srgb, var(--color-haldi) 45%, var(--color-ink))",
      }}
    >
      {label}
    </span>
  );
}