import { useState } from 'react';
import { X } from 'lucide-react';
import { AdSlot } from '../AdSlot';

interface DismissibleAdProps {
  slot: string;
  label?: string;
}

// A horizontal banner ad the user can close with an ✕. Non-intrusive: it sits
// inline at the bottom of the page (not a pop-up / overlay).
export function DismissibleAd({ slot, label = '贊助' }: DismissibleAdProps) {
  const [closed, setClosed] = useState(false);
  if (closed) return null;

  return (
    <div className="banner-ad">
      <button className="banner-ad-close" type="button" aria-label="關閉廣告" onClick={() => setClosed(true)}>
        <X size={16} />
      </button>
      <AdSlot slot={slot} label={label} />
    </div>
  );
}
