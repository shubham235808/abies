import { listAdminProducts } from '@abies/domain/modules/medicines/admin-products.service';
import { CreateProductForm } from './create-product-form';

export default async function AdminProductsPage() {
  const products = await listAdminProducts();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Products</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
        Add products to the master catalogue with an image and an MRP. Pharmacies set their own selling price and stock.
      </p>

      <CreateProductForm />

      <div className="mt-6 overflow-x-auto rounded-control border border-brand-neutral-100 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-brand-neutral-50 text-left text-brand-neutral-600">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Product</th>
              <th className="px-4 py-2.5 font-semibold">Brand</th>
              <th className="px-4 py-2.5 font-semibold">Category</th>
              <th className="px-4 py-2.5 font-semibold">MRP</th>
              <th className="px-4 py-2.5 font-semibold">Image</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-brand-neutral-500" colSpan={5}>
                  No products yet.
                </td>
              </tr>
            )}
            {products.map((p) => (
              <tr key={p.id} className="border-t border-brand-neutral-100">
                <td className="px-4 py-2.5 font-medium text-brand-neutral-900">{p.name}</td>
                <td className="px-4 py-2.5 text-brand-neutral-600">{p.brandName ?? '—'}</td>
                <td className="px-4 py-2.5 text-brand-neutral-600">{p.category ?? '—'}</td>
                <td className="px-4 py-2.5 text-brand-neutral-600">{p.mrp !== null ? `₹${p.mrp}` : '—'}</td>
                <td className="px-4 py-2.5">
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- served by the API, not optimised by next/image
                    <img src={p.imageUrl} alt="" className="h-10 w-10 rounded-control object-cover" />
                  ) : (
                    <span className="text-brand-neutral-400">none</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
