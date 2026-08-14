import Image from "next/image";

type BrandLockupProps = {
  size?: "hero" | "header";
  showTagline?: boolean;
};

/** Product: RF Orchestrator · short name: Orca */
export function BrandLockup({ size = "hero", showTagline = true }: BrandLockupProps) {
  const hero = size === "hero";
  return (
    <div className={hero ? "brand-lockup brand-lockup-hero" : "brand-lockup brand-lockup-header"}>
      <Image
        src={hero ? "/brand/rf-orca-logo.webp" : "/brand/rf-orca-mark.webp"}
        alt="RF Orca — Radio Frequency Orchestrator"
        width={hero ? 1200 : 256}
        height={hero ? 1563 : 256}
        priority={hero}
        className="brand-logo"
      />
      {showTagline && !hero ? (
        <div className="brand-text">
          <p className="brand-name">
            RF <span className="brand-orca">Orca</span>
          </p>
          <p className="brand-tagline">Radio Frequency Orchestrator</p>
        </div>
      ) : null}
    </div>
  );
}
