import Image from "next/image";

type BrandLockupProps = {
  size?: "hero" | "header";
  /** @deprecated Tagline removed from product UI — prop kept for call-site compat. */
  showTagline?: boolean;
};

/** Compact product mark — logo + RF Orca wordmark (no long subtitle). */
export function BrandLockup({ size = "hero" }: BrandLockupProps) {
  const hero = size === "hero";
  return (
    <div className={hero ? "brand-lockup brand-lockup-hero" : "brand-lockup brand-lockup-header"}>
      <Image
        src={hero ? "/brand/rf-orca-logo.webp" : "/brand/rf-orca-mark.webp"}
        alt="RForca"
        width={hero ? 1200 : 256}
        height={hero ? 1563 : 256}
        priority={hero}
        className="brand-logo"
      />
      {!hero ? (
        <div className="brand-text">
          <p className="brand-name">
            RF<span className="brand-orca">orca</span>
          </p>
        </div>
      ) : null}
    </div>
  );
}
