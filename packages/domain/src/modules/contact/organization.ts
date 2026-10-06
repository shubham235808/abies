import { getEnv } from '../../lib/env';

// The one place the public contact details come from. The Contact Us page and
// the WhatsApp button read them from GET /api/v1/contact/details; no frontend
// component hard-codes them.
export interface OrganizationContact {
  clinicName: string;
  contactPerson: string;
  addressLines: string[];
  mobile: string;
  // Digits with country code, as wa.me expects (no +).
  whatsapp: string;
  whatsappPrefill: string;
  supportEmail: string;
}

export function getOrganizationContact(): OrganizationContact {
  const env = getEnv();
  return {
    clinicName: 'AYUSHALAYA CLINIC',
    contactPerson: 'Dr. Madhukar Vashishtha',
    addressLines: ['#93, "Sumadhur Nivas"', 'Vasavi Nagar', 'Near Vasavi Kalyan Mantap', 'Hubballi - 580024', 'Karnataka, India'],
    mobile: env.ABIES_CONTACT_MOBILE,
    whatsapp: env.ABIES_CONTACT_WHATSAPP,
    // Human-initiated, so it carries no medical or account details.
    whatsappPrefill: 'Hello ABIES Ayurveda, I need assistance.',
    supportEmail: env.ABIES_CONTACT_SUPPORT_EMAIL,
  };
}
