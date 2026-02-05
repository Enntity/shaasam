type LogoMarkProps = {
  size?: number;
  className?: string;
};

export default function LogoMark({ size = 96, className }: LogoMarkProps) {
  return (
    <img
      className={className}
      src="/shaasam_logo.png"
      alt="Shaasam"
      width={size}
      height={size}
      style={{ width: size, height: 'auto' }}
      loading="eager"
    />
  );
}
