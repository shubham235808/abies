ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK(role IN ('patient','clinician','admin','delivery'));
ALTER TABLE users ADD COLUMN active boolean NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN phone text NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN birth_date date;
ALTER TABLE users ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE products ADD COLUMN active boolean NOT NULL DEFAULT true;
ALTER TABLE products ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE services ADD COLUMN active boolean NOT NULL DEFAULT true;
ALTER TABLE services ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE practitioners ADD COLUMN active boolean NOT NULL DEFAULT true;
ALTER TABLE practitioners ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE bookings DROP CONSTRAINT bookings_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_status_check CHECK(status IN ('confirmed','cancelled','completed'));
ALTER TABLE bookings ADD COLUMN reason text NOT NULL DEFAULT '';
ALTER TABLE bookings ADD COLUMN prescription_id uuid REFERENCES prescriptions(id);
ALTER TABLE orders ADD COLUMN fulfillment_status text NOT NULL DEFAULT 'ready'
 CHECK(fulfillment_status IN ('pending_review','ready','assigned','out_for_delivery','delivered','failed','cancelled'));
ALTER TABLE orders ADD COLUMN review_status text NOT NULL DEFAULT 'not_required'
 CHECK(review_status IN ('not_required','pending','approved','rejected'));
ALTER TABLE orders ADD COLUMN delivery_user_id uuid REFERENCES users(id);
ALTER TABLE orders ADD COLUMN delivery_note text NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE orders ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
UPDATE orders SET fulfillment_status='pending_review',review_status='pending' WHERE status='demo_awaiting_prescription_review';
ALTER TABLE audit_events ALTER COLUMN resource_id DROP NOT NULL;
ALTER TABLE audit_events ADD COLUMN resource_key text;
CREATE TABLE order_events (
 id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES orders(id), actor_id uuid NOT NULL REFERENCES users(id),
 event text NOT NULL, note text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX orders_delivery_idx ON orders(delivery_user_id,fulfillment_status);
CREATE INDEX bookings_patient_idx ON bookings(user_id,starts_at DESC);
CREATE INDEX prescriptions_booking_idx ON prescriptions(booking_id);
