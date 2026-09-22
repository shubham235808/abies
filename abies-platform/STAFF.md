# Staff workspaces

Sign in at the main Abies website. The sidebar shows the workspace allowed by your account role. Public registration always creates a patient account; users cannot choose their own staff permissions.

## First administrator

On this server, the requested separate account is `admin@abies.local`. Its generated credentials are stored privately in `.runtime/admin-account.json` (owner-only permissions, excluded from Git and images). Sign in, open **My profile**, and change the generated password. A password change signs out every session for that account.

For a new installation, after deployment:

```bash
bash scripts/create-admin.sh admin@abies.local 'Abies Administrator'
```

The command refuses to overwrite a credentials file or take over an existing email. It runs the administrator provisioning CLI inside the backend container; no administrator password is embedded in a Helm chart, image, seed or Git repository. Local Compose installations can run `node app/admin.js EMAIL NAME` inside their backend container and redirect its JSON output into a private file.

## Administration

- **Medicines:** add medicines, pack descriptions, categories, prices in rupees, stock, brand display colors and prescription requirements. Edit or archive items. Archived items disappear from the patient catalog and cannot be ordered.
- **Care team:** create doctors, therapists and collection practitioners; select a care category and link their doctor account. Archiving prevents new bookings. Changing an existing linked account is blocked while confirmed appointments remain; historic visits keep their original assigned doctor.
- **Services:** maintain consultation services, Panchkarma therapies, diagnostic packages and physiotherapy sessions, including prices, 30/60-minute durations and available care settings. Create a new record to change a care category.
- **Accounts:** ask each staff member to register with their own email/password. Search their email and use **Manage access** to grant Doctor/clinician, Delivery staff or Administrator. Link doctor accounts under Care team. The account holder should refresh the page to see the workspace. Disable access when needed; unlink practitioner profiles or reassign active deliveries first when requested by the application. Disabling an account invalidates its existing sessions.
- **Appointments:** view operational appointment details without patient intake or clinical notes.
- **Orders & delivery:** review prescription orders, record the decision and reason, then assign ready orders to an enabled delivery account. Rejections cancel fulfillment and restore reserved inventory once. Failed deliveries can be reassigned. Review decisions, assignments and delivery events appear in order activity.

Edits use record versions to prevent silent overwrites when two staff members change the same record. On a conflict, close the editor, refresh the workspace and reopen the record. Lists show the latest 200 appointments/orders or up to 200 matching accounts; account search can find older accounts.

## Doctor workspace

Doctors see only assigned appointments. **View patient** shows the patient's name, contact details, optional date of birth, reason for the visit, and any prescription specifically shared with that appointment. It does not expose unrelated patient files or another doctor's appointments. Doctors can issue written prescriptions to the patient's records and mark an appointment completed after its start time. Cancelled visits cannot be opened for clinical access.

Patients can update contact details in **My profile** and choose intake notes and an existing prescription when booking. Patient document access and staff changes are audited in PostgreSQL.

## Delivery workspace

Delivery accounts see only their assigned order reference, recipient name, phone, delivery address, item count and delivery status. They cannot retrieve medicine names, prescription files or clinical information. The workflow is **Assigned → Out for delivery → Delivered**. A failed attempt requires a reason; an administrator can then reassign it. Patients see the current fulfillment status under **Prescriptions & orders** (refresh to receive new updates).

## Operations and limits

Database changes run once through tracked, transaction-protected SQL migrations using a PostgreSQL advisory lock. Existing initialized installations are adopted without rerunning catalog seeds. Back up PostgreSQL before upgrading; deploy an application/database-compatible rollback instead of deleting migration records.

This remains a demonstration care/checkout system: payments, video calls, courier integrations and real clinical dispensing are not connected. Prescription approval is an internal workflow, not an automated clinical assessment. Verify staff qualifications and operational requirements before using it for real patient care.

## Checks

```bash
TEST_DATABASE_URL=postgresql://abies:YOUR_TEST_PASSWORD@127.0.0.1:55432/abies_test \
TEST_REDIS_URL=redis://127.0.0.1:56379/15 npm test --prefix backend
npm run build --prefix frontend
npm run test:helm
# Creates clearly named test accounts, one demo order, and archived catalog fixtures.
ABIES_BASE_URL=https://YOUR_HOST ABIES_ADMIN_CREDENTIALS=.runtime/admin-account.json \
ABIES_ALLOW_SELF_SIGNED=true npm run test:staff
```

Integration tests refuse any database name other than `abies_test` and Redis database other than `15`; both are reset during testing. Staff browser tests use the provided administrator login, exercise the roles and clean up account permissions, active bookings and catalog visibility. They retain demo order and audit history.
