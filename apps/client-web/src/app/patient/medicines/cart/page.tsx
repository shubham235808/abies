import { listMyCarts } from '@abies/domain/modules/medicines/cart.service';
import { requireSessionOrRedirect } from '@abies/domain/server/current-user';
import { CartView } from './cart-view';

export default async function PatientCartPage() {
  const session = await requireSessionOrRedirect();
  const carts = await listMyCarts(session.userId);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Cart</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
        Items you&rsquo;ve added from the medicines catalogue, grouped by pharmacy. Check out each pharmacy&rsquo;s cart separately.
      </p>

      <CartView initialCarts={carts} />
    </div>
  );
}
