'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Input, Select } from '@abies/design-system/components/ui/input';
import { Button } from '@abies/design-system/components/ui/button';

export function DoctorFilters({
  facets,
}: {
  facets: { specialties: string[]; languages: string[]; cities: string[] };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(searchParams.get('q') ?? '');

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    startTransition(() => router.push(`/doctors?${params.toString()}`));
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        updateParam('q', q);
      }}
      className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto_auto]"
    >
      <Input
        placeholder="Search by name or qualification"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search"
      />
      <Select
        aria-label="City"
        value={searchParams.get('city') ?? ''}
        onChange={(e) => updateParam('city', e.target.value)}
      >
        <option value="">Any city</option>
        {facets.cities.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </Select>
      <Select
        aria-label="Specialty"
        value={searchParams.get('specialty') ?? ''}
        onChange={(e) => updateParam('specialty', e.target.value)}
      >
        <option value="">Any specialty</option>
        {facets.specialties.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </Select>
      <Select
        aria-label="Language"
        value={searchParams.get('language') ?? ''}
        onChange={(e) => updateParam('language', e.target.value)}
      >
        <option value="">Any language</option>
        {facets.languages.map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </Select>
      <Button type="submit" loading={pending}>
        Search
      </Button>
    </form>
  );
}
