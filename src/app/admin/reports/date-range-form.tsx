'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';

export function DateRangeForm({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const [fromValue, setFromValue] = useState(from);
  const [toValue, setToValue] = useState(to);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        router.push(`/admin/reports?from=${fromValue}&to=${toValue}`);
      }}
      className="flex flex-wrap items-end gap-3"
    >
      <div>
        <Label htmlFor="report-from">From</Label>
        <Input id="report-from" type="date" value={fromValue} onChange={(e) => setFromValue(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="report-to">To</Label>
        <Input id="report-to" type="date" value={toValue} onChange={(e) => setToValue(e.target.value)} />
      </div>
      <Button type="submit" size="sm" variant="secondary">
        Apply
      </Button>
    </form>
  );
}
