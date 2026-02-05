type LogoMarkProps = {
  size?: number;
  className?: string;
};

export default function LogoMark({ size = 96, className }: LogoMarkProps) {
  return (
    <span
      className={['logo-mark', className].filter(Boolean).join(' ')}
      style={{ width: size, height: size }}
    >
      <img
        className="logo-mark__img"
        src="/shaasam_logo.png"
        alt="Shaasam"
        width={size}
        height={size}
        loading="eager"
      />
    </span>
  );
}
