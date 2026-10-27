import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';

export function PageMotion({ children, className = '' }: { children: ReactNode; className?: string }) {
  const reduceMotion = useReducedMotion();
  return <motion.div className={className} initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : 0.32, ease: 'easeOut' }}>{children}</motion.div>;
}

export function SectionTitle({ title, detail }: { title: string; detail: string }) {
  return <div className="content-heading"><div><h2>{title}</h2><p>{detail}</p></div></div>;
}

export function BackLink({ to, label }: { to: string; label: string }) {
  return <Link className="back-link" to={to}>{label}</Link>;
}

export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="error-notice" role="alert"><span>!</span><div><strong>We hit a snag.</strong><p>{message}</p></div>{onRetry && <button onClick={onRetry}>Try again ↻</button>}</div>;
}

export function Loading({ label }: { label: string }) {
  return <div className="loading-state"><span className="loading-spinner" /><p>{label}…</p></div>;
}

export function EmptyPanel({ title, text }: { title: string; text: string }) {
  return <div className="empty-panel"><h3>{title}</h3><p>{text}</p></div>;
}
