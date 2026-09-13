import type { CSSProperties, ReactNode } from 'react';
import styles from './Chip.module.css';

type Variant = 'default' | 'muted' | 'tinted' | 'solid';

interface ChipProps {
  children: ReactNode;
  variant?: Variant;
  /** A CSS colour or var() for the tinted and solid variants. */
  tint?: string;
  title?: string;
}

/** A small label: muscles, equipment, CNS load, progression currency. */
export function Chip({ children, variant = 'default', tint, title }: ChipProps) {
  const style = tint === undefined ? undefined : ({ '--chip-tint': tint } as CSSProperties);
  return (
    <span
      className={`${styles.chip} ${styles[variant] ?? ''}`}
      {...(style !== undefined ? { style } : {})}
      {...(title !== undefined ? { title } : {})}
    >
      {children}
    </span>
  );
}
