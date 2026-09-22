CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY, name text NOT NULL, email text UNIQUE NOT NULL,
 password_hash text NOT NULL, role text NOT NULL DEFAULT 'patient' CHECK(role IN ('patient','clinician')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS services (
 id text PRIMARY KEY, category text NOT NULL, name text NOT NULL, description text NOT NULL,
 price integer NOT NULL CHECK(price >= 0), duration integer NOT NULL, modes text[] NOT NULL
);
CREATE TABLE IF NOT EXISTS practitioners (
 id text PRIMARY KEY, name text NOT NULL, specialty text NOT NULL, category text NOT NULL,
 user_id uuid UNIQUE REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS products (
 id text PRIMARY KEY, name text NOT NULL, subtitle text NOT NULL, category text NOT NULL,
 price integer NOT NULL CHECK(price > 0), stock integer NOT NULL CHECK(stock >= 0),
 prescription_required boolean NOT NULL DEFAULT false, color text NOT NULL
);
CREATE TABLE IF NOT EXISTS bookings (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), service_id text NOT NULL REFERENCES services(id),
 practitioner_id text NOT NULL REFERENCES practitioners(id), starts_at timestamptz NOT NULL,
 mode text NOT NULL, address text, price integer NOT NULL,
 status text NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS booking_slot ON bookings(practitioner_id, starts_at) WHERE status='confirmed';
CREATE TABLE IF NOT EXISTS prescriptions (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), booking_id uuid REFERENCES bookings(id),
 author_id uuid REFERENCES users(id), filename text, mime text, file_data bytea, notes text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS orders (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), total integer NOT NULL,
 address text NOT NULL, prescription_id uuid REFERENCES prescriptions(id),
 status text NOT NULL, idempotency_key uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,idempotency_key)
);
CREATE TABLE IF NOT EXISTS order_items (
 order_id uuid NOT NULL REFERENCES orders(id), product_id text NOT NULL REFERENCES products(id),
 name text NOT NULL, quantity integer NOT NULL CHECK(quantity>0), unit_price integer NOT NULL,
 PRIMARY KEY(order_id,product_id)
);
CREATE TABLE IF NOT EXISTS audit_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor_id uuid REFERENCES users(id),
 action text NOT NULL, resource_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO services(id,category,name,description,price,duration,modes) VALUES
 ('doctor','doctor','Ayurveda consultation','A dedicated conversation about your wellbeing, habits and care goals.',70000,30,ARRAY['video','clinic']),
 ('abhyanga','panchkarma','Abhyanga therapy','A traditional warm oil therapy session with a qualified practitioner.',180000,60,ARRAY['clinic']),
 ('shirodhara','panchkarma','Shirodhara consultation','Discuss suitability and plan your personalised therapy programme.',90000,30,ARRAY['clinic']),
 ('wellness','diagnostics','Essential wellness panel','A sample package including blood count, glucose and lipid profile.',149900,30,ARRAY['home','clinic']),
 ('thyroid','diagnostics','Thyroid profile','A sample thyroid test package with a scheduled collection.',69900,30,ARRAY['home','clinic']),
 ('physio','physio','Movement & mobility','An assessment and personalised physiotherapy session.',100000,60,ARRAY['home','clinic'])
 ON CONFLICT DO NOTHING;
INSERT INTO practitioners(id,name,specialty,category) VALUES
 ('ananya','Dr. Ananya Sharma','Ayurveda • sample practitioner','doctor'),
 ('arjun','Dr. Arjun Mehta','Ayurveda • sample practitioner','doctor'),
 ('meera','Dr. Meera Nair','Panchkarma • sample practitioner','panchkarma'),
 ('collection','Lab collection team','Diagnostics • sample team','diagnostics'),
 ('rohan','Rohan Kapoor','Physiotherapy • sample practitioner','physio')
 ON CONFLICT DO NOTHING;
INSERT INTO products(id,name,subtitle,category,price,stock,prescription_required,color) VALUES
 ('ashwagandha','Ashwagandha','60 tablets · sample product','Daily wellness',34900,80,false,'purple'),
 ('triphala','Triphala','60 tablets · sample product','Everyday balance',24900,100,false,'orange'),
 ('brahmi','Brahmi','60 tablets · sample product','Mindful living',29900,60,false,'blue'),
 ('chyawanprash','Chyawanprash','500 g · sample product','Daily wellness',39900,50,false,'pink'),
 ('clinical','Practitioner formulation','30 tablets · sample product','Prescribed care',59900,20,true,'purple')
 ON CONFLICT DO NOTHING;
