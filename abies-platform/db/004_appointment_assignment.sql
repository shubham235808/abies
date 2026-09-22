-- Keep historic patient access with the doctor originally assigned to each visit.
ALTER TABLE bookings ADD COLUMN assigned_clinician_id uuid REFERENCES users(id);
UPDATE bookings b SET assigned_clinician_id=p.user_id FROM practitioners p WHERE p.id=b.practitioner_id;
CREATE INDEX bookings_clinician_idx ON bookings(assigned_clinician_id,starts_at DESC);
