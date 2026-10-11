'use client';

import { useState } from 'react';
import { Button } from '@abies/design-system/components/ui/button';
import { Label } from '@abies/design-system/components/ui/input';
import { Modal } from '@abies/design-system/components/ui/modal';
import { MediaLibrary, MediaThumb, mediaFileUrl, type MediaKind } from './media-library';

export interface PickedMedia {
  id: string;
  name?: string;
}

// A form field that stores a media-library asset id. Any module that can
// reference library assets reuses this rather than its own file input.
export function MediaPickerField({
  label,
  kind,
  value,
  onChange,
}: {
  label: string;
  kind: MediaKind;
  value: PickedMedia | null;
  onChange: (value: PickedMedia | null) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1 flex items-center gap-3">
        {value && (
          <div className="h-16 w-24 shrink-0 overflow-hidden rounded-control border border-brand-neutral-200">
            <MediaThumb kind={kind} src={mediaFileUrl(value.id)} alt={value.name ?? 'Selected file'} />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {value?.name && <span className="max-w-[12rem] truncate text-sm text-brand-neutral-700">{value.name}</span>}
          <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}>
            {value ? 'Change' : 'Choose from library'}
          </Button>
          {value && (
            <Button type="button" size="sm" variant="ghost" onClick={() => onChange(null)}>
              Remove
            </Button>
          )}
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={kind === 'VIDEO' ? 'Choose a video' : 'Choose an image'} className="max-w-4xl">
        {open && (
          <div className="max-h-[70vh] overflow-y-auto pr-1">
            <MediaLibrary
              kind={kind}
              onSelect={(asset) => {
                onChange({ id: asset.id, name: asset.originalName });
                setOpen(false);
              }}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
