'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input, Label, FieldError, Textarea } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { api, ApiError } from '@/lib/api-client';
import { updatePatientProfileSchema } from '@/modules/patients/patients.schemas';

type FormValues = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  gender?: string;
  address?: string;
  city?: string;
  state?: string;
  pin?: string;
  preferredLanguage?: string;
  emergencyContact?: string;
  allergiesText?: string;
  medicalHistory?: string;
};

export function ProfileForm({
  initial,
}: {
  initial: {
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    dateOfBirth: string | null;
    gender: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    pin: string | null;
    preferredLanguage: string;
    emergencyContact: string | null;
    allergies: string[];
    medicalHistory: string | null;
  };
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      firstName: initial.firstName ?? '',
      lastName: initial.lastName ?? '',
      email: initial.email ?? '',
      phone: initial.phone ?? '',
      dateOfBirth: initial.dateOfBirth ?? '',
      gender: initial.gender ?? '',
      address: initial.address ?? '',
      city: initial.city ?? '',
      state: initial.state ?? '',
      pin: initial.pin ?? '',
      preferredLanguage: initial.preferredLanguage,
      emergencyContact: initial.emergencyContact ?? '',
      allergiesText: initial.allergies.join(', '),
      medicalHistory: initial.medicalHistory ?? '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    setSaved(false);
    try {
      const { allergiesText, ...rest } = values;
      // Empty strings mean "left blank in the form", not "clear this
      // field" — the update schema's optional() fields reject '' for
      // refined types like dateOfBirth, so omit them rather than send ''.
      const cleaned = Object.fromEntries(
        Object.entries(rest).filter(([, v]) => v !== '' && v !== undefined),
      );
      const payload = updatePatientProfileSchema.parse({
        ...cleaned,
        allergies: allergiesText
          ? allergiesText
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
      });
      await api.patch('/api/patients/me', payload);
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save your profile. Please try again.');
    }
  });

  return (
    <form onSubmit={onSubmit} className="max-w-2xl space-y-6">
      {saved && <Alert tone="success">Profile saved.</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="firstName">First name</Label>
          <Input id="firstName" {...register('firstName')} />
        </div>
        <div>
          <Label htmlFor="lastName">Last name</Label>
          <Input id="lastName" {...register('lastName')} />
        </div>
        <div>
          <Label htmlFor="dateOfBirth">Date of birth</Label>
          <Input id="dateOfBirth" type="date" {...register('dateOfBirth')} />
        </div>
        <div>
          <Label htmlFor="gender">Gender</Label>
          <Input id="gender" {...register('gender')} />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" {...register('email')} />
          <FieldError>{errors.email?.message}</FieldError>
        </div>
        <div>
          <Label htmlFor="phone">Alternate phone</Label>
          <Input id="phone" {...register('phone')} />
        </div>
        <div>
          <Label htmlFor="preferredLanguage">Preferred language</Label>
          <Input id="preferredLanguage" {...register('preferredLanguage')} />
        </div>
        <div>
          <Label htmlFor="emergencyContact">Emergency contact</Label>
          <Input id="emergencyContact" {...register('emergencyContact')} />
        </div>
      </div>

      <div>
        <Label htmlFor="address">Address</Label>
        <Input id="address" {...register('address')} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="city">City</Label>
          <Input id="city" {...register('city')} />
        </div>
        <div>
          <Label htmlFor="state">State</Label>
          <Input id="state" {...register('state')} />
        </div>
        <div>
          <Label htmlFor="pin">PIN code</Label>
          <Input id="pin" {...register('pin')} />
        </div>
      </div>

      <div>
        <Label htmlFor="allergiesText">Allergies (comma-separated)</Label>
        <Input id="allergiesText" placeholder="Penicillin, Peanuts" {...register('allergiesText')} />
      </div>
      <div>
        <Label htmlFor="medicalHistory">Relevant medical history</Label>
        <Textarea id="medicalHistory" rows={4} {...register('medicalHistory')} />
      </div>

      <Button type="submit" loading={isSubmitting}>
        Save profile
      </Button>
    </form>
  );
}
