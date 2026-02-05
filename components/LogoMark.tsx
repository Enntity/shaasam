import Image from 'next/image';

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
      <Image
        className="logo-mark__img"
        src="/shaasam_logo.png"
        alt="Shaasam"
        width={size}
        height={size}
        priority
      />
    </span>
  );
}
