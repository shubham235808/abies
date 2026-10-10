import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { assertSameOrigin } from '@abies/domain/server/origin';
import { contactSchema } from '@abies/domain/modules/contact/contact.schemas';
import { submitContactEnquiry } from '@abies/domain/modules/contact/contact.service';

// Public Contact Us. No session: a general enquiry never needs an account.
// Browsers send Origin on a POST, so a form posted from another site is refused.
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);

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
