import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { getOrganizationContact } from '@abies/domain/modules/contact/organization';

// Public contact details, read by the Contact Us page and the WhatsApp button.
export async function GET(req: Request) {
  try {
    return NextResponse.json({ contact: getOrganizationContact() });
  } catch (error) {
    return errorResponse(error, req);
  }
}
