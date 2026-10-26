import React from 'react';
import { formatShortAddress } from '../formatting/address.js';
import { CopyButton } from './CopyButton.js';

export interface AddressTextProps {
  address: string;
  showCopy?: boolean;
  className?: string;
}

export function AddressText({ address, showCopy = true, className = '' }: AddressTextProps) {
  const short = formatShortAddress(address);

  return (
    <span className={`ui-address-text ${className}`} title={address}>
      <code className="ui-address-code">{short}</code>
      {showCopy && <CopyButton textToCopy={address} />}
    </span>
  );
}
