"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Plus,
  RefreshCw,
  X,
  Package,
  Stethoscope,
  Users,
  CalendarDays,
  Truck,
  Settings,
} from "lucide-react";
async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const r = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Unable to complete request");
  return d;
}
const money = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
    n / 100,
  );
const when = (s: string) =>
  new Date(s).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }) + " UTC";
const words = (s: string) => s.replaceAll("_", " ");
type StaffUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  version: number;
};
type Entry = {
  id: string;
  name: string;
  category: string;
  active: boolean;
  version: number;
  subtitle?: string;
  price?: number;
  stock?: number;
  prescription_required?: boolean;
  color?: string;
  description?: string;
  duration?: number;
  modes?: string[];
  specialty?: string;
  user_id?: string | null;
};
type Catalog = { products: Entry[]; services: Entry[]; practitioners: Entry[] };
type Booking = {
  id: string;
  patient_name: string;
  practitioner_name?: string;
  service_name: string;
  starts_at: string;
  status: string;
  mode: string;
};
type Order = {
  id: string;
  customer_name: string;
  customer_phone: string;
  address: string;
  total: number;
  fulfillment_status: string;
  review_status: string;
  prescription_id: string | null;
  delivery_user_id: string | null;
  delivery_name: string;
  version: number;
  items: { name: string; quantity: number }[];
  events: { event: string; note: string; created_at: string }[];
};
function Dialog({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} className="staff-dialog" onCancel={close}>
      <header>
        <h2>{title}</h2>
        <button type="button" onClick={close} aria-label="Close panel">
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
function Badge({ value }: { value: string }) {
  return (
    <span
      className={
        "staff-badge " +
        (["delivered", "completed", "approved", "active"].includes(value)
          ? "good"
          : "")
      }
    >
      {words(value)}
    </span>
  );
}
function Heading({
  title,
  description,
  refresh,
}: {
  title: string;
  description: string;
  refresh: () => void;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <button
        className="outline"
        onClick={refresh}
        aria-label="Refresh workspace"
      >
        <RefreshCw size={16} /> Refresh
      </button>
    </div>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
function useAction() {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  async function act(fn: () => Promise<void>, message = "") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      setNotice(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  return {
    act,
    busy,
    feedback: (
      <>
        {error && (
          <div className="staff-feedback error" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="staff-feedback" role="status">
            {notice}
          </div>
        )}
      </>
    ),
  };
}
const kinds = ["products", "practitioners", "services"] as const;
type Kind = (typeof kinds)[number];
const labels = {
  products: "Medicines",
  practitioners: "Doctors & practitioners",
  services: "Services & test packages",
};
export function AdminPanel({
  accountId,
  onCatalogChange,
}: {
  accountId: string;
  onCatalogChange: () => Promise<void>;
}) {
  const [tab, setTab] = useState("products"),
    [catalog, setCatalog] = useState<Catalog>({
      products: [],
      practitioners: [],
      services: [],
    }),
    [users, setUsers] = useState<StaffUser[]>([]),
    [orders, setOrders] = useState<Order[]>([]),
    [bookings, setBookings] = useState<Booking[]>([]),
    [stats, setStats] = useState<Record<string, number>>({}),
    [loaded, setLoaded] = useState(false),
    [query, setQuery] = useState("");
  const [edit, setEdit] = useState<{ kind: Kind; entry?: Entry } | null>(null),
    [access, setAccess] = useState<StaffUser | null>(null),
    [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const { act, busy, feedback } = useAction();
  const load = useCallback(async () => {
    const [c, u, o, b, s] = await Promise.all([
      api<Catalog>("/admin/catalog"),
      api<StaffUser[]>("/admin/users"),
      api<Order[]>("/admin/orders"),
      api<Booking[]>("/admin/bookings"),
      api<Record<string, number>>("/admin/overview"),
    ]);
    setCatalog(c);
    setUsers(u);
    setOrders(o);
    setBookings(b);
    setStats(s);
    setLoaded(true);
  }, []);
  useEffect(() => {
    void act(load);
  }, [load]);
  async function changed() {
    await load();
    await onCatalogChange();
  }
  const filtered = (rows: Entry[]) =>
    rows.filter((x) =>
      (x.name + " " + x.category).toLowerCase().includes(query.toLowerCase()),
    );
  return (
    <section className="staff">
      <Heading
        title="Administration"
        description="Manage your care team, medicines and daily operations."
        refresh={() => void act(load)}
      />
      <div className="staff-stats">
        {[
          ["products", "Active medicines"],
          ["practitioners", "Practitioners"],
          ["bookings", "Upcoming visits"],
          ["orders", "Open orders"],
          ["reviews", "Awaiting review"],
        ].map(([key, label]) => (
          <div key={key}>
            <span>{label}</span>
            <strong>{stats[key] ?? "—"}</strong>
          </div>
        ))}
      </div>
      <nav className="staff-tabs" aria-label="Administration sections">
        {[
          ["products", "Medicines", Package],
          ["practitioners", "Care team", Stethoscope],
          ["services", "Services", Settings],
          ["users", "Accounts", Users],
          ["bookings", "Appointments", CalendarDays],
          ["orders", "Orders & delivery", Truck],
        ].map(([key, label, Icon]) => {
          const I = Icon as typeof Package;
          return (
            <button
              key={key as string}
              className={tab === key ? "selected" : ""}
              onClick={() => {
                setTab(key as string);
                setQuery("");
              }}
            >
              <I size={17} />
              {label as string}
            </button>
          );
        })}
      </nav>
      {!edit && !access && !selectedOrder && feedback}
      {!loaded ? (
        <Empty>Loading administration…</Empty>
      ) : (
        <>
          {kinds.includes(tab as Kind) && (
            <>
              <div className="staff-toolbar">
                <label className="staff-search">
                  Search {labels[tab as Kind].toLowerCase()}
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by name or category"
                  />
                </label>
                <button
                  className="primary"
                  onClick={() => setEdit({ kind: tab as Kind })}
                >
                  <Plus size={17} /> Add{" "}
                  {tab === "products"
                    ? "medicine"
                    : tab === "practitioners"
                      ? "practitioner"
                      : "service"}
                </button>
              </div>
              <div className="staff-grid">
                {filtered(catalog[tab as Kind]).map((e) => (
                  <article className="staff-card" key={e.id}>
                    <div className="staff-card-top">
                      <span className="staff-eyebrow">{e.category}</span>
                      <Badge value={e.active ? "active" : "archived"} />
                    </div>
                    <h3>{e.name}</h3>
                    <p>{e.subtitle || e.specialty || e.description}</p>
                    <div className="staff-meta">
                      {e.price !== undefined && (
                        <strong>{money(e.price)}</strong>
                      )}
                      {e.stock !== undefined && <span>{e.stock} in stock</span>}
                      {e.duration && (
                        <span>
                          {e.duration} minutes · {e.modes?.join(", ")}
                        </span>
                      )}
                      {tab === "practitioners" && (
                        <span>
                          {users.find((u) => u.id === e.user_id)?.email ||
                            (e.user_id
                              ? "Linked doctor account"
                              : "No doctor account linked")}
                        </span>
                      )}
                      {e.prescription_required && (
                        <Badge value="prescription_required" />
                      )}
                    </div>
                    <button
                      className="outline"
                      onClick={() => setEdit({ kind: tab as Kind, entry: e })}
                    >
                      Edit {tab === "products" ? "medicine" : "details"}
                    </button>
                  </article>
                ))}
              </div>
              {!filtered(catalog[tab as Kind]).length && (
                <Empty>No matching records. Add one to get started.</Empty>
              )}
            </>
          )}
          {tab === "users" && (
            <>
              <div className="staff-note">
                Staff should create their own account using Sign in → Create an
                account. Find their email here, grant their role, then link
                doctor accounts under Care team. Role changes apply on their
                next page refresh.
              </div>
              <form
                className="staff-toolbar"
                onSubmit={(e) => {
                  e.preventDefault();
                  void act(async () =>
                    setUsers(
                      await api<StaffUser[]>(
                        "/admin/users?q=" + encodeURIComponent(query),
                      ),
                    ),
                  );
                }}
              >
                <label className="staff-search">
                  Find an account
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Name or email"
                  />
                </label>
                <button className="primary" disabled={busy}>
                  Search accounts
                </button>
              </form>
              <div className="staff-table">
                <table>
                  <thead>
                    <tr>
                      <th>Account</th>
                      <th>Role</th>
                      <th>Access</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td>
                          <strong>{u.name}</strong>
                          <small>{u.email}</small>
                        </td>
                        <td>
                          {u.role === "clinician" ? "Doctor" : words(u.role)}
                        </td>
                        <td>
                          <Badge value={u.active ? "active" : "disabled"} />
                        </td>
                        <td>
                          <button
                            className="outline"
                            disabled={u.id === accountId}
                            onClick={() => setAccess(u)}
                          >
                            {u.id === accountId
                              ? "Your account"
                              : "Manage access"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="subtle">
                Showing up to 200 matching accounts. Search by email to find
                older accounts.
              </p>
            </>
          )}
          {tab === "bookings" && (
            <>
              <p className="subtle">
                Most recent 200 scheduled appointments. Clinical details are
                available to the assigned doctor.
              </p>
              {bookings.map((b) => (
                <article className="staff-card staff-row" key={b.id}>
                  <div>
                    <h3>{b.patient_name}</h3>
                    <p>
                      {b.service_name} · {b.practitioner_name}
                    </p>
                    <small>
                      {when(b.starts_at)} · {b.mode}
                    </small>
                  </div>
                  <Badge value={b.status} />
                </article>
              ))}
              {!bookings.length && <Empty>No appointments yet.</Empty>}
            </>
          )}
          {tab === "orders" && (
            <>
              <div className="staff-note">
                Checkout remains a demonstration: no money is collected.
                Prescription review records an operational decision; only
                qualified staff should approve dispensing.
              </div>
              {orders.map((o) => (
                <article className="staff-card staff-row" key={o.id}>
                  <div>
                    <span className="staff-eyebrow">
                      Order {o.id.slice(0, 8)}
                    </span>
                    <h3>{o.customer_name}</h3>
                    <p>
                      {o.items
                        .map((i) => `${i.name} × ${i.quantity}`)
                        .join(", ")}
                    </p>
                    <small>
                      {money(o.total)} ·{" "}
                      {o.delivery_name
                        ? `Assigned to ${o.delivery_name}`
                        : "Unassigned"}
                    </small>
                  </div>
                  <div className="staff-actions">
                    <Badge value={o.fulfillment_status} />
                    <button
                      className="outline"
                      onClick={() => setSelectedOrder(o)}
                    >
                      Manage order
                    </button>
                  </div>
                </article>
              ))}
              {!orders.length && <Empty>No orders yet.</Empty>}
              <p className="subtle">Showing the latest 200 orders.</p>
            </>
          )}
        </>
      )}
      {edit && (
        <Dialog
          title={
            (edit.entry ? "Edit " : "Add ") +
            (edit.kind === "products"
              ? "medicine"
              : edit.kind === "practitioners"
                ? "practitioner"
                : "service")
          }
          close={() => setEdit(null)}
        >
          {feedback}
          <CatalogForm
            kind={edit.kind}
            entry={edit.entry}
            users={users}
            busy={busy}
            save={(d) =>
              void act(async () => {
                await api(
                  "/admin/" +
                    edit.kind +
                    (edit.entry ? "/" + edit.entry.id : ""),
                  edit.entry ? "PUT" : "POST",
                  {
                    ...d,
                    ...(edit.entry ? { version: edit.entry.version } : {}),
                  },
                );
                await changed();
                setEdit(null);
              }, "Catalog saved. Changes are visible to patients.")
            }
          />
        </Dialog>
      )}
      {access && (
        <Dialog title="Manage account access" close={() => setAccess(null)}>
          {feedback}
          <p>
            {access.name} · {access.email}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void act(async () => {
                await api("/admin/users/" + access.id, "PUT", {
                  role: f.get("role"),
                  active: f.get("active") === "on",
                  version: access.version,
                });
                await load();
                setAccess(null);
              }, "Account access updated.");
            }}
          >
            <label>
              Role
              <select name="role" defaultValue={access.role}>
                <option value="patient">Patient</option>
                <option value="clinician">Doctor / clinician</option>
                <option value="delivery">Delivery staff</option>
                <option value="admin">Administrator</option>
              </select>
            </label>
            <label className="staff-check">
              <input
                type="checkbox"
                name="active"
                defaultChecked={access.active}
              />{" "}
              Account enabled
            </label>
            <p className="subtle">
              Administrators can manage accounts, catalog and orders. Grant this
              role only to trusted staff.
            </p>
            <button className="primary" disabled={busy}>
              Save access
            </button>
          </form>
        </Dialog>
      )}
      {selectedOrder && (
        <Dialog
          title={"Order " + selectedOrder.id.slice(0, 8)}
          close={() => setSelectedOrder(null)}
        >
          {feedback}
          <h3>{selectedOrder.customer_name}</h3>
          <p>{selectedOrder.customer_phone || "No phone provided"}</p>
          <p className="staff-pre">{selectedOrder.address}</p>
          <Badge value={selectedOrder.fulfillment_status} />
          <ul>
            {selectedOrder.items.map((i, n) => (
              <li key={n}>
                {i.name} × {i.quantity}
              </li>
            ))}
          </ul>
          {selectedOrder.prescription_id && (
            <a
              className="outline"
              href={"/api/admin/orders/" + selectedOrder.id + "/prescription"}
              target="_blank"
              rel="noreferrer"
            >
              View order prescription
            </a>
          )}
          {selectedOrder.review_status === "pending" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void act(async () => {
                  await api(
                    "/admin/orders/" + selectedOrder.id + "/review",
                    "POST",
                    {
                      decision: f.get("decision"),
                      note: f.get("note"),
                      version: selectedOrder.version,
                    },
                  );
                  await load();
                  setSelectedOrder(null);
                }, "Review recorded.");
              }}
            >
              <label>
                Review decision
                <select name="decision">
                  <option value="approved">Approve for fulfillment</option>
                  <option value="rejected">Reject and restore stock</option>
                </select>
              </label>
              <label>
                Review note
                <textarea name="note" required minLength={5} maxLength={500} />
              </label>
              <button className="primary" disabled={busy}>
                Record review
              </button>
            </form>
          )}
          {["ready", "assigned", "failed"].includes(
            selectedOrder.fulfillment_status,
          ) && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void act(async () => {
                  await api(
                    "/admin/orders/" + selectedOrder.id + "/assign",
                    "POST",
                    {
                      deliveryUserId: f.get("courier"),
                      version: selectedOrder.version,
                    },
                  );
                  await load();
                  setSelectedOrder(null);
                }, "Delivery assigned.");
              }}
            >
              <label>
                Delivery staff
                <select
                  name="courier"
                  required
                  defaultValue={selectedOrder.delivery_user_id || ""}
                >
                  <option value="">Choose delivery staff</option>
                  {users
                    .filter((u) => u.role === "delivery" && u.active)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} · {u.email}
                      </option>
                    ))}
                </select>
              </label>
              <button className="primary" disabled={busy}>
                Assign delivery
              </button>
            </form>
          )}
          <h3 className="staff-section-title">Order activity</h3>
          {selectedOrder.events.length ? (
            selectedOrder.events.map((e, n) => (
              <div className="staff-event" key={n}>
                <strong>{words(e.event)}</strong>
                <small>{when(e.created_at)}</small>
                <p>{e.note}</p>
              </div>
            ))
          ) : (
            <p className="subtle">No fulfillment updates yet.</p>
          )}
        </Dialog>
      )}
    </section>
  );
}
function CatalogForm({
  kind,
  entry: e,
  users,
  busy,
  save,
}: {
  kind: Kind;
  entry?: Entry;
  users: StaffUser[];
  busy: boolean;
  save: (d: Record<string, unknown>) => void;
}) {
  const [category, setCategory] = useState(e?.category || "doctor");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const f = new FormData(event.currentTarget);
        const d: Record<string, unknown> = {
          name: f.get("name"),
          category: kind === "products" ? f.get("category") : category,
          active: f.get("active") === "on",
        };
        if (kind === "products")
          Object.assign(d, {
            subtitle: f.get("subtitle"),
            price: Math.round(Number(f.get("price")) * 100),
            stock: Number(f.get("stock")),
            prescription_required: f.get("prescription_required") === "on",
            color: f.get("color"),
          });
        if (kind === "services")
          Object.assign(d, {
            description: f.get("description"),
            price: Math.round(Number(f.get("price")) * 100),
            duration: Number(f.get("duration")),
            modes: f.getAll("modes"),
          });
        if (kind === "practitioners")
          Object.assign(d, {
            specialty: f.get("specialty"),
            user_id: f.get("user_id") || null,
          });
        save(d);
      }}
    >
      <label>
        Name
        <input
          name="name"
          required
          minLength={2}
          maxLength={120}
          defaultValue={e?.name}
        />
      </label>
      {kind === "products" ? (
        <>
          <label>
            Category
            <input
              name="category"
              required
              minLength={2}
              maxLength={80}
              defaultValue={e?.category || "Wellness"}
            />
          </label>
          <label>
            Subtitle / pack size
            <input
              name="subtitle"
              required
              minLength={2}
              maxLength={180}
              defaultValue={e?.subtitle}
            />
          </label>
          <div className="form-row">
            <label>
              Price (₹)
              <input
                name="price"
                type="number"
                required
                min="0.01"
                max="1000000"
                step="0.01"
                defaultValue={(e?.price ?? 0) / 100}
              />
            </label>
            <label>
              Stock units
              <input
                name="stock"
                type="number"
                required
                min="0"
                max="1000000"
                step="1"
                defaultValue={e?.stock ?? 0}
              />
            </label>
          </div>
          <label>
            Display color
            <select name="color" defaultValue={e?.color || "purple"}>
              <option value="purple">Deep purple</option>
              <option value="pink">Fuchsia pink</option>
              <option value="blue">Cyan blue</option>
              <option value="orange">Tangerine orange</option>
            </select>
          </label>
          <label className="staff-check">
            <input
              type="checkbox"
              name="prescription_required"
              defaultChecked={e?.prescription_required}
            />{" "}
            Prescription required
          </label>
        </>
      ) : (
        <>
          <label>
            Care category
            <select
              value={category}
              disabled={!!e}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="doctor">Doctor consultation</option>
              <option value="panchkarma">Panchkarma</option>
              <option value="diagnostics">Diagnostics</option>
              <option value="physio">Physiotherapy</option>
            </select>
          </label>
          {kind === "practitioners" ? (
            <>
              <label>
                Specialty / qualification
                <input
                  name="specialty"
                  required
                  minLength={2}
                  maxLength={180}
                  defaultValue={e?.specialty}
                />
              </label>
              <label>
                Linked doctor account
                <select name="user_id" defaultValue={e?.user_id || ""}>
                  <option value="">Not linked</option>
                  {e?.user_id && !users.some((u) => u.id === e.user_id) && (
                    <option value={e.user_id}>Current linked account</option>
                  )}
                  {users
                    .filter((u) => u.role === "clinician" && u.active)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} · {u.email}
                      </option>
                    ))}
                </select>
              </label>
              <p className="subtle">
                Assign the Doctor role in Accounts first. The linked account can
                access patients booked with this practitioner.
              </p>
            </>
          ) : (
            <>
              <label>
                Description
                <textarea
                  name="description"
                  required
                  minLength={10}
                  maxLength={1000}
                  defaultValue={e?.description}
                />
              </label>
              <div className="form-row">
                <label>
                  Price (₹)
                  <input
                    name="price"
                    type="number"
                    required
                    min="0"
                    max="1000000"
                    step="0.01"
                    defaultValue={(e?.price ?? 0) / 100}
                  />
                </label>
                <label>
                  Duration
                  <select name="duration" defaultValue={e?.duration ?? 30}>
                    <option value="30">30 minutes</option>
                    <option value="60">60 minutes</option>
                  </select>
                </label>
              </div>
              <fieldset>
                <legend>Available settings (choose at least one)</legend>
                {(category === "doctor"
                  ? ["video", "clinic", "home"]
                  : ["clinic", "home"]
                ).map((m) => (
                  <label className="staff-check" key={m}>
                    <input
                      name="modes"
                      value={m}
                      type="checkbox"
                      defaultChecked={e ? e.modes?.includes(m) : m === "clinic"}
                    />
                    {words(m)}
                  </label>
                ))}
              </fieldset>
            </>
          )}
        </>
      )}
      <label className="staff-check">
        <input
          type="checkbox"
          name="active"
          defaultChecked={e?.active ?? true}
        />{" "}
        Visible in patient catalog
      </label>
      <p className="subtle">
        Uncheck to archive. Existing appointments and order records remain
        available.
      </p>
      <button className="primary full" disabled={busy}>
        {busy
          ? "Saving…"
          : "Save " +
            (kind === "products"
              ? "medicine"
              : kind === "services"
                ? "service"
                : "practitioner")}
      </button>
    </form>
  );
}
type Patient = Booking & {
  patient_email: string;
  patient_phone: string;
  birth_date: string | null;
  address: string;
  reason: string;
  prescription_id: string | null;
  shared_prescription?: { filename: string | null; notes: string | null };
  prescriptions: { id: string; notes: string; created_at: string }[];
};
export function DoctorPanel() {
  const [bookings, setBookings] = useState<Booking[]>([]),
    [patient, setPatient] = useState<Patient | null>(null),
    [query, setQuery] = useState(""),
    [loaded, setLoaded] = useState(false);
  const { act, busy, feedback } = useAction();
  const load = useCallback(async () => {
    setBookings(await api<Booking[]>("/clinician/bookings"));
    setLoaded(true);
  }, []);
  useEffect(() => {
    void act(load);
  }, [load]);
  return (
    <section className="staff">
      <Heading
        title="Doctor workspace"
        description="Your assigned appointments, patient details and prescriptions."
        refresh={() => void act(load)}
      />
      {!patient && feedback}
      <label className="staff-search">
        Find a patient or appointment
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search patient or service"
        />
      </label>
      {bookings
        .filter((b) =>
          (b.patient_name + " " + b.service_name)
            .toLowerCase()
            .includes(query.toLowerCase()),
        )
        .map((b) => (
          <article className="staff-card staff-row" key={b.id}>
            <div>
              <h3>{b.patient_name}</h3>
              <p>
                {b.service_name} · {b.mode}
              </p>
              <small>{when(b.starts_at)}</small>
            </div>
            <div className="staff-actions">
              <Badge value={b.status} />
              {b.status !== "cancelled" && (
                <button
                  className="primary"
                  onClick={() =>
                    void act(async () =>
                      setPatient(
                        await api<Patient>("/clinician/bookings/" + b.id),
                      ),
                    )
                  }
                >
                  View patient
                </button>
              )}
            </div>
          </article>
        ))}
      {!bookings.length && (
        <Empty>
          {loaded
            ? "No appointments assigned. Ask your administrator to link your account to a practitioner profile."
            : "Loading appointments…"}
        </Empty>
      )}
      {patient && (
        <Dialog title={patient.patient_name} close={() => setPatient(null)}>
          {feedback}
          <Badge value={patient.status} />
          <p>
            {patient.service_name} · {when(patient.starts_at)}
          </p>
          <dl className="staff-details">
            <div>
              <dt>Email</dt>
              <dd>{patient.patient_email}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{patient.patient_phone || "Not provided"}</dd>
            </div>
            <div>
              <dt>Date of birth</dt>
              <dd>{patient.birth_date?.slice(0, 10) || "Not provided"}</dd>
            </div>
            <div>
              <dt>Care setting</dt>
              <dd>{patient.mode}</dd>
            </div>
            {patient.address && (
              <div>
                <dt>Visit address</dt>
                <dd>{patient.address}</dd>
              </div>
            )}
          </dl>
          <h3>Reason for visit</h3>
          <p className="staff-pre">
            {patient.reason || "No intake notes provided."}
          </p>
          {patient.shared_prescription && (
            <div className="staff-note">
              <strong>Shared by patient</strong>
              <p className="staff-pre">{patient.shared_prescription.notes}</p>
              {patient.shared_prescription.filename && (
                <a
                  href={"/api/clinician/bookings/" + patient.id + "/attachment"}
                >
                  Download {patient.shared_prescription.filename}
                </a>
              )}
            </div>
          )}
          <h3 className="staff-section-title">Appointment prescriptions</h3>
          {patient.prescriptions.map((p) => (
            <div className="staff-event" key={p.id}>
              <small>{when(p.created_at)}</small>
              <p className="staff-pre">{p.notes}</p>
            </div>
          ))}
          {!patient.prescriptions.length && (
            <p className="subtle">
              No prescription issued for this appointment.
            </p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const f = new FormData(form);
              void act(async () => {
                await api("/clinician/prescriptions", "POST", {
                  bookingId: patient.id,
                  notes: f.get("notes"),
                });
                setPatient(
                  await api<Patient>("/clinician/bookings/" + patient.id),
                );
                form.reset();
              }, "Prescription saved to the patient’s records.");
            }}
          >
            <label>
              Write prescription
              <textarea
                name="notes"
                required
                minLength={10}
                maxLength={5000}
                placeholder="Medicine, dosage, duration and follow-up instructions"
              />
            </label>
            <button className="primary" disabled={busy}>
              Issue prescription
            </button>
          </form>
          {patient.status === "confirmed" &&
            new Date(patient.starts_at).getTime() <= Date.now() && (
              <button
                className="outline"
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    await api(
                      "/clinician/bookings/" + patient.id + "/complete",
                      "POST",
                      {},
                    );
                    await load();
                    setPatient(null);
                  }, "Appointment completed.")
                }
              >
                Mark appointment completed
              </button>
            )}
        </Dialog>
      )}
    </section>
  );
}
type Delivery = {
  id: string;
  recipient_name: string;
  recipient_phone: string;
  address: string;
  item_count: number;
  fulfillment_status: string;
  delivery_note: string;
  version: number;
};
export function DeliveryPanel() {
  const [orders, setOrders] = useState<Delivery[]>([]),
    [selected, setSelected] = useState<Delivery | null>(null),
    [loaded, setLoaded] = useState(false);
  const { act, busy, feedback } = useAction();
  const load = useCallback(async () => {
    setOrders(await api<Delivery[]>("/delivery/orders"));
    setLoaded(true);
  }, []);
  useEffect(() => {
    void act(load);
  }, [load]);
  return (
    <section className="staff">
      <Heading
        title="Delivery workspace"
        description="Your assigned deliveries and recipient contact details."
        refresh={() => void act(load)}
      />
      {!selected && feedback}
      <div className="staff-stats">
        {["assigned", "out_for_delivery", "delivered"].map((s) => (
          <div key={s}>
            <span>{words(s)}</span>
            <strong>
              {orders.filter((o) => o.fulfillment_status === s).length}
            </strong>
          </div>
        ))}
      </div>
      <div className="staff-grid">
        {orders.map((o) => (
          <article className="staff-card" key={o.id}>
            <div className="staff-card-top">
              <span className="staff-eyebrow">Order {o.id.slice(0, 8)}</span>
              <Badge value={o.fulfillment_status} />
            </div>
            <h3>{o.recipient_name}</h3>
            <p>{o.recipient_phone || "Phone not provided"}</p>
            <p className="staff-pre">{o.address}</p>
            <p>{o.item_count} item(s)</p>
            {o.delivery_note && <p>Delivery note: {o.delivery_note}</p>}
            {["assigned", "out_for_delivery"].includes(
              o.fulfillment_status,
            ) && (
              <button className="primary" onClick={() => setSelected(o)}>
                Update delivery
              </button>
            )}
          </article>
        ))}
      </div>
      {!orders.length && (
        <Empty>
          {loaded
            ? "No deliveries assigned yet. Your administrator will assign ready orders here."
            : "Loading deliveries…"}
        </Empty>
      )}
      {selected && (
        <Dialog title="Update delivery" close={() => setSelected(null)}>
          {feedback}
          <p>
            {selected.recipient_name} · Order {selected.id.slice(0, 8)}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void act(async () => {
                await api(
                  "/delivery/orders/" + selected.id + "/status",
                  "POST",
                  {
                    status: f.get("status"),
                    note: f.get("note"),
                    version: selected.version,
                  },
                );
                await load();
                setSelected(null);
              }, "Delivery status updated.");
            }}
          >
            <label>
              New status
              <select name="status">
                {selected.fulfillment_status === "assigned" ? (
                  <option value="out_for_delivery">Out for delivery</option>
                ) : (
                  <option value="delivered">Delivered</option>
                )}
                <option value="failed">Delivery failed</option>
              </select>
            </label>
            <label>
              Delivery note
              <textarea
                name="note"
                maxLength={500}
                placeholder="Required if delivery failed (at least 5 characters)"
              />
            </label>
            <button className="primary" disabled={busy}>
              Save delivery status
            </button>
          </form>
        </Dialog>
      )}
    </section>
  );
}
export function ProfilePanel({
  onUpdate,
  onSignOut,
}: {
  onUpdate: (name: string) => void;
  onSignOut: () => void;
}) {
  const [profile, setProfile] = useState<{
    name: string;
    email: string;
    phone: string;
    birth_date: string | null;
  } | null>(null);
  const { act, busy, feedback } = useAction();
  useEffect(() => {
    void act(async () => setProfile(await api("/profile")));
  }, []);
  return (
    <section className="staff">
      <div className="page-heading">
        <div>
          <h1>My profile</h1>
          <p>
            Keep your contact details up to date for appointments and
            deliveries.
          </p>
        </div>
      </div>
      {feedback}
      {profile && (
        <div className="staff-grid">
          <article className="staff-card">
            <h2>Personal details</h2>
            <p>{profile.email}</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void act(async () => {
                  const p = await api<typeof profile>("/profile", "PUT", {
                    name: f.get("name"),
                    phone: f.get("phone"),
                    birth_date: f.get("birth_date") || null,
                  });
                  setProfile(p);
                  onUpdate(p.name);
                }, "Profile saved.");
              }}
            >
              <label>
                Full name
                <input
                  name="name"
                  defaultValue={profile.name}
                  required
                  minLength={2}
                  maxLength={100}
                />
              </label>
              <label>
                Phone number
                <input
                  name="phone"
                  type="tel"
                  defaultValue={profile.phone}
                  maxLength={30}
                />
              </label>
              <label>
                Date of birth
                <input
                  name="birth_date"
                  type="date"
                  defaultValue={profile.birth_date?.slice(0, 10) || ""}
                  min="1900-01-01"
                  max={new Date().toISOString().slice(0, 10)}
                />
              </label>
              <p className="subtle">
                Your assigned doctor can see these details. Delivery staff see
                your name, phone and delivery address.
              </p>
              <button className="primary" disabled={busy}>
                Save profile
              </button>
            </form>
          </article>
          <article className="staff-card">
            <h2>Change password</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void act(async () => {
                  if (f.get("newPassword") !== f.get("confirm"))
                    throw new Error("New passwords do not match");
                  await api("/auth/password", "POST", {
                    currentPassword: f.get("currentPassword"),
                    newPassword: f.get("newPassword"),
                  });
                  onSignOut();
                });
              }}
            >
              <label>
                Current password
                <input
                  name="currentPassword"
                  type="password"
                  required
                  autoComplete="current-password"
                  maxLength={128}
                />
              </label>
              <label>
                New password
                <input
                  name="newPassword"
                  type="password"
                  required
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                />
              </label>
              <label>
                Confirm new password
                <input
                  name="confirm"
                  type="password"
                  required
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                />
              </label>
              <p className="subtle">
                Use at least 12 characters. You will need to sign in again.
              </p>
              <button className="primary" disabled={busy}>
                Change password
              </button>
            </form>
          </article>
        </div>
      )}
    </section>
  );
}
