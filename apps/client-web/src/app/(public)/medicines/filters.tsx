'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Input, Select } from '@abies/design-system/components/ui/input';
import { Button } from '@abies/design-system/components/ui/button';

export function MedicinesFilters({ facets }: { facets: { areas: string[]; categories: string[]; brands: string[] } }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(searchParams.get('q') ?? '');
  const [priceMin, setPriceMin] = useState(searchParams.get('priceMin') ?? '');
  const [priceMax, setPriceMax] = useState(searchParams.get('priceMax') ?? '');

  function updateParams(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    startTransition(() => router.push(`/medicines?${params.toString()}`));
  }

  return (
    <div className="space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          updateParams({ q, priceMin, priceMax });
        }}
        className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto_auto]"
      >
        <Input placeholder="Search by medicine name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        <Input
          type="number"
          min={0}
          placeholder="Min ₹"
          className="w-24"
          value={priceMin}
          onChange={(e) => setPriceMin(e.target.value)}
          aria-label="Minimum price"
        />
        <Input
          type="number"
          min={0}
          placeholder="Max ₹"
          className="w-24"
          value={priceMax}
          onChange={(e) => setPriceMax(e.target.value)}
          aria-label="Maximum price"
        />
        <Button type="submit" loading={pending}>
          Search
        </Button>
      </form>

      <div className="grid gap-3 sm:grid-cols-3">
        <Select aria-label="Area" value={searchParams.get('area') ?? ''} onChange={(e) => updateParams({ area: e.target.value })}>
          <option value="">Any area</option>
          {facets.areas.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </Select>
        <Select aria-label="Category" value={searchParams.get('category') ?? ''} onChange={(e) => updateParams({ category: e.target.value })}>
          <option value="">Any category</option>
          {facets.categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Select aria-label="Brand" value={searchParams.get('brand') ?? ''} onChange={(e) => updateParams({ brand: e.target.value })}>
          <option value="">Any brand</option>
          {facets.brands.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
