'use client';

import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { Button } from '@abies/design-system/components/ui/button';
import { Input, Label, FieldError, Textarea } from '@abies/design-system/components/ui/input';
import { Alert } from '@abies/design-system/components/ui/alert';
import { api, ApiError } from '@abies/design-system/api-client';
import { updateDoctorProfileSchema } from '@abies/domain/modules/doctors/doctors.schemas';

type FormValues = {
  title?: string;
  firstName?: string;
  lastName?: string;
  gender?: string;
  bio?: string;
  registrationCouncil?: string;
  registrationNumber?: string;
  registrationYear?: string;
  primaryQualification?: string;
  highestQualification?: string;
  graduationInstitution?: string;
  graduationYear?: string;
  yearsExperience?: string;
  specialtiesText?: string;
  languagesText?: string;
  video: boolean;
  clinic: boolean;
  videoFee?: string;
  clinicFee?: string;
};

export interface DoctorProfileInitial {
  title: string;
  firstName: string | null;
  lastName: string | null;
  gender: string | null;
  bio: string | null;
  registrationCouncil: string | null;
  registrationNumber: string | null;
  registrationYear: number | null;
  primaryQualification: string | null;
  highestQualification: string | null;
  graduationInstitution: string | null;
  graduationYear: number | null;
  yearsExperience: number | null;
  specialties: string[];
  languages: string[];
  consultationModes: ('VIDEO' | 'CLINIC')[];
  videoFee: number | null;
  clinicFee: number | null;
}

export function DoctorProfileForm({ initial, editable }: { initial: DoctorProfileInitial; editable: boolean }) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      title: initial.title,
      firstName: initial.firstName ?? '',
      lastName: initial.lastName ?? '',
      gender: initial.gender ?? '',
      bio: initial.bio ?? '',
      registrationCouncil: initial.registrationCouncil ?? '',
      registrationNumber: initial.registrationNumber ?? '',
      registrationYear: initial.registrationYear?.toString() ?? '',
      primaryQualification: initial.primaryQualification ?? '',
      highestQualification: initial.highestQualification ?? '',
      graduationInstitution: initial.graduationInstitution ?? '',
      graduationYear: initial.graduationYear?.toString() ?? '',
      yearsExperience: initial.yearsExperience?.toString() ?? '',
      specialtiesText: initial.specialties.join(', '),
      languagesText: initial.languages.join(', '),
      video: initial.consultationModes.includes('VIDEO'),
      clinic: initial.consultationModes.includes('CLINIC'),
      videoFee: initial.videoFee?.toString() ?? '',
      clinicFee: initial.clinicFee?.toString() ?? '',
    },
    disabled: !editable,
  });

  const video = useWatch({ control, name: 'video' });
  const clinic = useWatch({ control, name: 'clinic' });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    setSaved(false);
    try {
      const consultationModes = [
        ...(values.video ? (['VIDEO'] as const) : []),
        ...(values.clinic ? (['CLINIC'] as const) : []),
      ];
      const numeric = (v?: string) => (v ? Number(v) : undefined);
      const raw = {
        title: values.title,
        firstName: values.firstName,
        lastName: values.lastName,
        gender: values.gender,
        bio: values.bio,
        registrationCouncil: values.registrationCouncil,
        registrationNumber: values.registrationNumber,
        registrationYear: numeric(values.registrationYear),
        primaryQualification: values.primaryQualification,
        highestQualification: values.highestQualification,
        graduationInstitution: values.graduationInstitution,
        graduationYear: numeric(values.graduationYear),
        yearsExperience: numeric(values.yearsExperience),
        specialties: values.specialtiesText
          ? values.specialtiesText.split(',').map((s) => s.trim()).filter(Boolean)
          : [],
        languages: values.languagesText
          ? values.languagesText.split(',').map((s) => s.trim()).filter(Boolean)
          : [],
        consultationModes,
        videoFee: values.video ? numeric(values.videoFee) : undefined,
        clinicFee: values.clinic ? numeric(values.clinicFee) : undefined,
      };
      const cleaned = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== '' && v !== undefined));
      const payload = updateDoctorProfileSchema.parse(cleaned);
      await api.patch('/api/v1/doctors/me', payload);
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save your profile.');
    }
  });

  return (
    <form onSubmit={onSubmit} className="max-w-2xl space-y-6">
      {!editable && (
        <Alert tone="info">
          Your profile is locked while verification is in progress or approved. Contact ABIES support for
          regulated changes.
        </Alert>
      )}
      {saved && <Alert tone="success">Profile saved.</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="title">Title</Label>
          <Input id="title" {...register('title')} />
        </div>
        <div>
          <Label htmlFor="firstName">First name</Label>
          <Input id="firstName" {...register('firstName')} />
        </div>
        <div>
          <Label htmlFor="lastName">Last name</Label>
          <Input id="lastName" {...register('lastName')} />
        </div>
      </div>

      <div>
        <Label htmlFor="bio">Bio</Label>
        <Textarea id="bio" rows={3} {...register('bio')} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="registrationCouncil">Registration council</Label>
          <Input id="registrationCouncil" {...register('registrationCouncil')} />
          <FieldError>{errors.registrationCouncil?.message}</FieldError>
        </div>
        <div>
          <Label htmlFor="registrationNumber">Registration number</Label>
          <Input id="registrationNumber" {...register('registrationNumber')} />
        </div>
        <div>
          <Label htmlFor="primaryQualification">Primary qualification</Label>
          <Input id="primaryQualification" placeholder="BAMS" {...register('primaryQualification')} />
        </div>
        <div>
          <Label htmlFor="highestQualification">Highest qualification</Label>
          <Input id="highestQualification" placeholder="MD (Ayurveda)" {...register('highestQualification')} />
        </div>
        <div>
          <Label htmlFor="graduationInstitution">Graduation institution</Label>
          <Input id="graduationInstitution" {...register('graduationInstitution')} />
        </div>
        <div>
          <Label htmlFor="graduationYear">Graduation year</Label>
          <Input id="graduationYear" inputMode="numeric" {...register('graduationYear')} />
        </div>
        <div>
          <Label htmlFor="yearsExperience">Years of experience</Label>
          <Input id="yearsExperience" inputMode="numeric" {...register('yearsExperience')} />
        </div>
      </div>

      <div>
        <Label htmlFor="specialtiesText">Specialties (comma-separated)</Label>
        <Input id="specialtiesText" placeholder="Panchakarma, Digestive Health" {...register('specialtiesText')} />
      </div>
      <div>
        <Label htmlFor="languagesText">Languages (comma-separated)</Label>
        <Input id="languagesText" placeholder="English, Hindi" {...register('languagesText')} />
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-brand-neutral-800">Consultation modes</legend>
        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" disabled={!editable} {...register('video')} /> Video
          </label>
          {video && (
            <Input placeholder="Video fee (₹)" inputMode="numeric" className="sm:w-40" {...register('videoFee')} />
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" disabled={!editable} {...register('clinic')} /> Clinic
          </label>
          {clinic && (
            <Input placeholder="Clinic fee (₹)" inputMode="numeric" className="sm:w-40" {...register('clinicFee')} />
          )}
        </div>
      </fieldset>

      {editable && (
        <Button type="submit" loading={isSubmitting}>
          Save profile
        </Button>
      )}
    </form>
  );
}
