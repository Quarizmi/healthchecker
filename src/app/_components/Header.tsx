import Link from "next/link";

export function Header() {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        padding: "14px 24px",
        borderBottom: "1px solid rgba(0, 0, 0, 0.08)",
      }}
    >
      <Link href="/" style={{ display: "inline-flex", alignItems: "center" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- the logo is a
            static brand asset, not a page-driven image needing next/image's
            optimization pipeline. */}
        <img src="/quarizmi-logo.svg" alt="Quarizmi" height={28} style={{ display: "block" }} />
      </Link>
    </header>
  );
}
