import React from 'react';
import Image from 'next/image';

interface JournalCoverProps {
  src?: string;
  alt?: string;
  size?: 'sm' | 'md' | 'lg';
  priority?: boolean;
  className?: string;
}

export default function JournalCover({
  src = '/images/TANQ.png',
  alt = 'Journal Cover',
  size = 'md',
  priority = false,
  className = '',
}: JournalCoverProps) {
  // Sizing configurations
  const sizeClasses = {
    sm: 'w-32 sm:w-36 aspect-[3/4]',
    md: 'w-44 sm:w-52 aspect-[3/4]',
    lg: 'w-52 sm:w-64 aspect-[3/4]',
  };

  // Adjust spine and page edge thickness based on size
  const thickness = {
    sm: '8px',
    md: '10px',
    lg: '12px',
  };

  const currentThickness = thickness[size];
  const translateZValue = `-${currentThickness}`;
  const halfThickness = `${parseFloat(currentThickness) / 2}px`;

  return (
    <div className={`book-perspective select-none group block relative ${sizeClasses[size]} ${className}`}>
      {/* Book Container with 3D Preserve context */}
      <div 
        className="relative w-full h-full book-preserve-3d transition-all duration-700 ease-out book-shadow group-hover:book-shadow-hover rounded-r-[4px] rounded-l-[2px]"
        style={{
          // Custom styles to handle dynamic 3D hover transformation
          transform: 'rotateY(-6deg) rotateX(2deg)',
        }}
      >
        {/* Dynamic Hover rotation applied through style to merge with inline variables if needed */}
        <div 
          className="w-full h-full book-preserve-3d transition-transform duration-700 ease-out group-hover:[transform:rotateY(-20deg)_rotateX(8deg)_translateZ(10px)]"
        >
          {/* Page Edge (3D Thickness on the right side) */}
          <div 
            className="absolute right-0 top-[1.5%] bottom-[1.5%] bg-gradient-to-r from-[#fcfcfa] to-[#f4f2ea] border-y border-r border-border-light/70 rounded-r-[2px] origin-right"
            style={{
              width: currentThickness,
              transform: `rotateY(90deg) translateZ(${halfThickness})`,
            }}
          />

          {/* Book Spine Edge (3D Thickness on the left side) */}
          <div 
            className="absolute left-0 top-0 bottom-0 bg-olive-dark rounded-l-[1px] origin-left"
            style={{
              width: currentThickness,
              transform: `rotateY(-90deg) translateZ(${halfThickness})`,
              backgroundColor: '#383220', // slightly darker olive
            }}
          />

          {/* Book Back Cover (shifted in Z-space) */}
          <div 
            className="absolute inset-0 w-full h-full bg-[#383220] rounded-l-[2px] rounded-r-[3px] border border-black/10"
            style={{
              transform: `translateZ(${translateZValue})`,
            }}
          />

          {/* Book Front Cover (Z = 0) */}
          <div className="absolute inset-0 w-full h-full book-preserve-3d z-10 rounded-l-[2px] rounded-r-[3px] overflow-hidden border border-border-custom/60 bg-white">
            <Image 
              src={src} 
              alt={alt} 
              fill 
              className="object-cover"
              priority={priority}
            />

            {/* Spine fold crease highlight & shadow overlay */}
            {/* The physical indentation lines */}
            <div className="absolute top-0 bottom-0 left-[6px] w-[2px] bg-black/15 z-20" />
            <div className="absolute top-0 bottom-0 left-0 w-[6px] bg-gradient-to-r from-black/25 via-black/10 to-transparent z-20" />
            <div className="absolute top-0 bottom-0 left-[8px] w-[12px] bg-gradient-to-r from-transparent via-white/10 to-transparent z-20" />

            {/* Soft sheen light reflection on hover */}
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-white/20 opacity-0 group-hover:opacity-100 transition-opacity duration-700 z-30 pointer-events-none" />
          </div>
        </div>
      </div>
    </div>
  );
}
