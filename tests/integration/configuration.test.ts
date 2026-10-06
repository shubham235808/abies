// @vitest-environment node
import { randomInt } from 'crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '@abies/domain/lib/db';
import { ConflictError, NotFoundError } from '@abies/domain/lib/errors';
import {
  createConfigCategory,
  createCourierProvider,
  createDocumentRequirement,
  createGstRate,
  createNotificationTemplate,
  createServiceLocation,
  listConfigCategories,
  listGstRates,
  removeConfigCategory,
  removeCourierProvider,
  removeDocumentRequirement,
  removeGstRate,
  removeNotificationTemplate,
  removeServiceLocation,
  updateConfigCategory,
  updateGstRate,
} from '@abies/domain/modules/configuration/configuration.service';
import { listAuditEvents, listDistinctEventTypes } from '@abies/domain/modules/audit/audit.service';
import { notificationTemplateSchema } from '@abies/domain/modules/configuration/configuration.schemas';

const createdCategoryIds: string[] = [];
const createdLocationIds: string[] = [];
const createdRequirementIds: string[] = [];
const createdCourierIds: string[] = [];
const createdTemplateIds: string[] = [];
const createdGstRateIds: string[] = [];
const domainTag = `TEST_DOMAIN_${randomInt(100000, 999999)}`;

afterAll(async () => {
  await prisma.configCategory.deleteMany({ where: { id: { in: createdCategoryIds } } });
  await prisma.serviceLocation.deleteMany({ where: { id: { in: createdLocationIds } } });
  await prisma.documentRequirement.deleteMany({ where: { id: { in: createdRequirementIds } } });
  await prisma.courierProvider.deleteMany({ where: { id: { in: createdCourierIds } } });
  await prisma.notificationTemplate.deleteMany({ where: { id: { in: createdTemplateIds } } });
  await prisma.gstRateConfig.deleteMany({ where: { id: { in: createdGstRateIds } } });
  await prisma.$disconnect();
});

describe('config categories', () => {
  it('creates, lists, updates and removes an entry', async () => {
    const created = await createConfigCategory({ domain: domainTag, key: 'panchakarma', label: 'Panchakarma' }, {});
    createdCategoryIds.push(created.id);
    expect(created.active).toBe(true);

    const listed = await listConfigCategories(domainTag);
    expect(listed.map((c) => c.id)).toContain(created.id);

    const updated = await updateConfigCategory(created.id, { active: false }, {});
    expect(updated.active).toBe(false);

    await removeConfigCategory(created.id, {});
    const afterRemoval = await listConfigCategories(domainTag);
    expect(afterRemoval.map((c) => c.id)).not.toContain(created.id);
    createdCategoryIds.splice(createdCategoryIds.indexOf(created.id), 1);
  });

  it('refuses a duplicate (domain, key) pair', async () => {
    const created = await createConfigCategory({ domain: domainTag, key: 'diagnostics', label: 'Diagnostics' }, {});
    createdCategoryIds.push(created.id);
    await expect(createConfigCategory({ domain: domainTag, key: 'diagnostics', label: 'Diagnostics again' }, {})).rejects.toThrow(
      ConflictError,
    );
  });

  it('throws NotFoundError updating an unknown id', async () => {
    await expect(updateConfigCategory('does-not-exist', { active: false }, {})).rejects.toThrow(NotFoundError);
  });

  it('records a CONFIGURATION audit event discoverable by filter', async () => {
    const created = await createConfigCategory({ domain: domainTag, key: 'medicines', label: 'Medicines' }, {});
    createdCategoryIds.push(created.id);

    const eventTypes = await listDistinctEventTypes();
    expect(eventTypes).toContain('CONFIGURATION');

    const { events } = await listAuditEvents({ eventType: 'CONFIGURATION', resourceType: 'ConfigCategory' });
    expect(events.some((e) => e.resourceId === created.id && e.action === 'CREATED')).toBe(true);
  });
});

describe('service locations', () => {
  it('creates, lists and removes a location, refusing a duplicate city/state pair', async () => {
    const city = `TestCity${randomInt(100000, 999999)}`;
    const created = await createServiceLocation({ city, state: 'Maharashtra', pinCodes: ['411001'] }, {});
    createdLocationIds.push(created.id);
    expect(created.pinCodes).toEqual(['411001']);

    await expect(createServiceLocation({ city, state: 'Maharashtra', pinCodes: [] }, {})).rejects.toThrow(ConflictError);

    await removeServiceLocation(created.id, {});
    createdLocationIds.splice(createdLocationIds.indexOf(created.id), 1);
    await expect(removeServiceLocation(created.id, {})).rejects.toThrow(NotFoundError);
  });
});

describe('document requirements', () => {
  it('creates and removes a requirement, refusing a duplicate partnerType/documentType pair', async () => {
    const documentType = `TEST_DOC_${randomInt(100000, 999999)}`;
    const created = await createDocumentRequirement({ partnerType: 'THERAPIST', documentType, required: true }, {});
    createdRequirementIds.push(created.id);

    await expect(createDocumentRequirement({ partnerType: 'THERAPIST', documentType, required: false }, {})).rejects.toThrow(
      ConflictError,
    );

    await removeDocumentRequirement(created.id, {});
    createdRequirementIds.splice(createdRequirementIds.indexOf(created.id), 1);
  });
});

describe('courier providers', () => {
  it('creates and removes a provider, refusing a duplicate code', async () => {
    const code = `TEST_COURIER_${randomInt(100000, 999999)}`;
    const created = await createCourierProvider({ code, label: 'Test Courier' }, {});
    createdCourierIds.push(created.id);

    await expect(createCourierProvider({ code, label: 'Duplicate' }, {})).rejects.toThrow(ConflictError);

    await removeCourierProvider(created.id, {});
    createdCourierIds.splice(createdCourierIds.indexOf(created.id), 1);
  });
});

describe('notification templates', () => {
  it('creates and removes a template, refusing a duplicate templateKey', async () => {
    const templateKey = `test.template.${randomInt(100000, 999999)}`;
    const created = await createNotificationTemplate(
      { templateKey, channel: 'IN_APP', body: 'Hello {{name}}' },
      {},
    );
    createdTemplateIds.push(created.id);

    await expect(createNotificationTemplate({ templateKey, channel: 'EMAIL', body: 'x' }, {})).rejects.toThrow(ConflictError);
    expect(notificationTemplateSchema.safeParse({ templateKey, channel: 'SMS', body: 'x' }).success).toBe(false);

    await removeNotificationTemplate(created.id, {});
    createdTemplateIds.splice(createdTemplateIds.indexOf(created.id), 1);
  });
});

describe('GST rates (ENTERPRISE-7)', () => {
  it('creates, lists, updates and removes a rate, refusing a duplicate HSN code', async () => {
    const hsnCode = `TEST_HSN_${randomInt(100000, 999999)}`;
    const created = await createGstRate({ hsnCode, label: 'Test goods', ratePercent: 18 }, {});
    createdGstRateIds.push(created.id);
    expect(created.active).toBe(true);

    const listed = await listGstRates();
    expect(listed.map((r) => r.id)).toContain(created.id);

    await expect(createGstRate({ hsnCode, label: 'Duplicate', ratePercent: 5 }, {})).rejects.toThrow(ConflictError);

    const updated = await updateGstRate(created.id, { ratePercent: 12 }, {});
    expect(updated.ratePercent).toBe(12);

    await removeGstRate(created.id, {});
    createdGstRateIds.splice(createdGstRateIds.indexOf(created.id), 1);
    await expect(updateGstRate(created.id, { ratePercent: 5 }, {})).rejects.toThrow(NotFoundError);
  });
});
