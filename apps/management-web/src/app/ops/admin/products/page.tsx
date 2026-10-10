import { listAdminProducts } from '@abies/domain/modules/medicines/admin-products.service';
import { ProductsManager } from './products-manager';

export default async function AdminProductsPage() {
  const products = await listAdminProducts();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Products</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
        Add, edit, and publish products in the master catalogue, and manage their pack-size variants. Pharmacies still set
        their own selling price and stock.
      </p>

      <ProductsManager initial={products} />
    </div>
  );
}
