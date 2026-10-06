import { NextResponse } from 'next/server';
import { errorResponse, ForbiddenError } from '@abies/domain/lib/errors';
import { contactSchema } from '@abies/domain/modules/contact/contact.schemas';
import { submitContactEnquiry } from '@abies/domain/modules/contact/contact.service';

// Public Contact Us. No session: a general enquiry never needs an account.
// Browsers send Origin on a POST, so a form posted from another site is refused.
export async function POST(req: Request) {
  try {
    const expected = new URL(process.env.APP_BASE_URL ?? 'https://dev.abies.in').origin;
    if (req.headers.get('origin') !== expected) throw new ForbiddenError('Cross-site request blocked');

    const input = contactSchema.parse(await req.json());
    const forwarded = req.headers.get('x-forwarded-for');
    const { referenceId } = await submitContactEnquiry(input, {
      ip: forwarded?.split(',')[0]?.trim() ?? undefined,
      userAgent: req.headers.get('user-agent')?.slice(0, 300) ?? undefined,
    });
    return NextResponse.json(
      { referenceId, message: 'Thank you. We have received your enquiry and will reply soon.' },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error, req);
  }
}
