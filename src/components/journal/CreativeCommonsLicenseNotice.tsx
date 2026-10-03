import Image from 'next/image';

const LICENSE_URL = 'https://creativecommons.org/licenses/by-nc-sa/4.0/';

interface CreativeCommonsLicenseNoticeProps {
  className?: string;
  linkClassName?: string;
  stacked?: boolean;
}

export default function CreativeCommonsLicenseNotice({
  className = '',
  linkClassName = '',
  stacked = false,
}: CreativeCommonsLicenseNoticeProps) {
  return (
    <div className={`flex items-start gap-3 ${stacked ? 'flex-col' : 'flex-col sm:flex-row sm:items-center'} ${className}`}>
      <p>
        This work is licensed under a{' '}
        <a href={LICENSE_URL} target="_blank" rel="noopener noreferrer" className={linkClassName}>
          Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License
        </a>{' '}
        (CC BY-NC-SA 4.0).
      </p>
      <a
        href={LICENSE_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="View the Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License"
        className="shrink-0"
      >
        <Image
          src="/images/cc-by-nc-sa.svg"
          alt="CC BY-NC-SA 4.0 license badge"
          width={120}
          height={42}
        />
      </a>
    </div>
  );
}
