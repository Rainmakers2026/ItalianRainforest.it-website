import { Fragment, type ReactNode } from 'react';

/** Renders **double-starred** spans of dictionary copy as <strong> (the source copy's keyword emphasis). */
export function rich(text: string): ReactNode {
  if (!text.includes('**')) return text;
  return text.split('**').map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : <Fragment key={i}>{part}</Fragment>));
}

/** The same copy as plain text, for attributes, metadata and structured data. */
export const plain = (text: string) => text.replaceAll('**', '');
