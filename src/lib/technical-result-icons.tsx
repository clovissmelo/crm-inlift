import {
  AlertTriangle,
  CircleSlash,
  PhoneCall,
  PhoneMissed,
  PhoneOff,
  type LucideIcon
} from "lucide-react";

const TECHNICAL_RESULT_ICONS: Record<string, LucideIcon> = {
  answered: PhoneCall,
  no_answer: PhoneMissed,
  busy: PhoneOff,
  invalid_number: CircleSlash,
  call_failed: AlertTriangle
};

export function technicalResultIconForSlug(slug: string): LucideIcon {
  return TECHNICAL_RESULT_ICONS[slug] ?? PhoneMissed;
}
