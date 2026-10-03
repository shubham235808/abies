'use client';

import { Button } from '@abies/design-system/components/ui/button';

export function PrintButton() {
  return (
    <Button variant="secondary" size="sm" onClick={() => window.print()}>
      Print
    </Button>
  );
}
