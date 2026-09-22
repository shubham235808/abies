"use client";
import {
  AdminPanel,
  DoctorPanel,
  DeliveryPanel,
  ProfilePanel,
} from "../components/StaffPanels";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  FlaskConical,
  Heart,
  HeartPulse,
  Home,
  Leaf,
  LogOut,
  Menu,
  Minus,
  Package,
  Pill,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Stethoscope,
  Trash2,
  Upload,
  User,
  Video,
  X,
} from "lucide-react";
type Product = {
  id: string;
  name: string;
  subtitle: string;
  category: string;
  price: number;
  stock: number;
  prescription_required: boolean;
  color: string;
};
type Service = {
  id: string;
  name: string;
  category: string;
  description: string;
  price: number;
  duration: number;
  modes: string[];
};
type Practitioner = {
  id: string;
  name: string;
  specialty: string;
  category: string;
};
type Account = { id: string; name: string; email: string; role: string };
type Booking = {
  id: string;
  service_name: string;
  practitioner_name: string;
  patient_name?: string;
  starts_at: string;
  mode: string;
  status: string;
  price: number;
};
type Prescription = {
  id: string;
  filename?: string;
  notes?: string;
  created_at: string;
};
type Order = {
  id: string;
  total: number;
  fulfillment_status: string;
  status: string;
  created_at: string;
  items: { name: string; quantity: number }[];
};
type Catalog = {
  products: Product[];
  services: Service[];
  practitioners: Practitioner[];
};
const money = (p: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(p / 100);
const when = (s: string) =>
  new Date(s).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }) + " UTC";
async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    headers:
      body instanceof FormData ? {} : { "Content-Type": "application/json" },
    ...(body
      ? { body: body instanceof FormData ? body : JSON.stringify(body) }
      : {}),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Unable to complete your request");
  return data;
}
const modules = [
  {
    id: "doctor",
    title: "Doctor consultation",
    short: "Expert care, wherever you are",
    icon: Stethoscope,
    color: "purple",
  },
  {
    id: "store",
    title: "Ayurveda medicines",
    short: "Wellness, delivered to you",
    icon: Pill,
    color: "pink",
  },
  {
    id: "panchkarma",
    title: "Panchkarma",
    short: "Restore your natural balance",
    icon: Leaf,
    color: "orange",
  },
  {
    id: "diagnostics",
    title: "Diagnostic tests",
    short: "A clearer picture of your health",
    icon: FlaskConical,
    color: "blue",
  },
  {
    id: "physio",
    title: "Physiotherapy",
    short: "Move better. Feel stronger.",
    icon: Activity,
    color: "green",
  },
];
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
      dialog?.close();
    };
  }, []);
  return (
    <dialog ref={ref} className="modal" onCancel={onClose} aria-label={title}>
      <header>
        <h2>{title}</h2>
        <button
          className="icon-btn"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
function Bottle({
  product,
  small = false,
}: {
  product: Product;
  small?: boolean;
}) {
  return (
    <div
      className={`product-art ${product.color} ${small ? "small" : ""}`}
      aria-hidden="true"
    >
      <span className="art-ring" />
      <div className="bottle">
        <div className="cap" />
        <div className="bottle-label">
          <span className="mini-brand">ABIES</span>
          <Leaf size={22} />
          <strong>{product.name}</strong>
          <span>AYURVEDA</span>
        </div>
      </div>
      <span className="art-leaf one" />
      <span className="art-leaf two" />
    </div>
  );
}
export default function Page() {
  const [view, setView] = useState("home"),
    [catalog, setCatalog] = useState<Catalog>({
      products: [],
      services: [],
      practitioners: [],
    }),
    [loaded, setLoaded] = useState(false),
    [user, setUser] = useState<Account | null>(null);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [auth, setAuth] = useState(false),
    [register, setRegister] = useState(false),
    [mobile, setMobile] = useState(false);
  const [cart, setCart] = useState<Record<string, number>>({}),
    [cartOpen, setCartOpen] = useState(false),
    [query, setQuery] = useState(""),
    [service, setService] = useState<Service | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]),
    [prescriptions, setPrescriptions] = useState<Prescription[]>([]),
    [orders, setOrders] = useState<Order[]>([]);
  const [practitioner, setPractitioner] = useState(""),
    [date, setDate] = useState(""),
    [slot, setSlot] = useState(""),
    [slots, setSlots] = useState<string[]>([]),
    [slotLoading, setSlotLoading] = useState(false),
    [mode, setMode] = useState(""),
    [address, setAddress] = useState(""),
    [reason, setReason] = useState(""),
    [sharedRx, setSharedRx] = useState("");
  const [rx, setRx] = useState(""),
    [video, setVideo] = useState<Booking | null>(null),
    [joined, setJoined] = useState(false);
  const checkoutKey = useRef<string | null>(null),
    cartReady = useRef(false);
  const refresh = useCallback(async () => {
    const [b, p, o] = await Promise.all([
      api<Booking[]>("/bookings"),
      api<Prescription[]>("/prescriptions"),
      api<Order[]>("/orders"),
    ]);
    setBookings(b);
    setPrescriptions(p);
    setOrders(o);
  }, []);
  useEffect(() => {
    api<Catalog>("/catalog")
      .then((c) => {
        setCatalog(c);
        setLoaded(true);
      })
      .catch((e) => setError(e.message));
    api<Account>("/auth/me")
      .then(setUser)
      .catch(() => {});
    try {
      const saved = JSON.parse(localStorage.getItem("abies-cart") || "{}");
      if (saved && typeof saved === "object" && !Array.isArray(saved))
        setCart(
          Object.fromEntries(
            Object.entries(saved).filter(
              ([, v]) =>
                typeof v === "number" &&
                Number.isInteger(v) &&
                v > 0 &&
                v <= 10,
            ),
          ) as Record<string, number>,
        );
    } catch {}
    cartReady.current = true;
  }, []);
  useEffect(() => {
    if (cartReady.current)
      localStorage.setItem("abies-cart", JSON.stringify(cart));
    checkoutKey.current = null;
  }, [cart]);
  useEffect(() => {
    checkoutKey.current = null;
  }, [address, rx]);
  useEffect(() => {
    if (user) {
      refresh().catch((e) => setError(e.message));
    } else {
      setBookings([]);
      setOrders([]);
      setPrescriptions([]);

      setRx("");
    }
  }, [user, refresh]);
  useEffect(() => {
    setSlot("");
    setSlots([]);
    if (!practitioner || !date) return;
    let active = true;
    setSlotLoading(true);
    api<string[]>(
      `/slots?practitionerId=${encodeURIComponent(practitioner)}&date=${date}`,
    )
      .then((s) => {
        if (active) setSlots(s);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setSlotLoading(false);
      });
    return () => {
      active = false;
    };
  }, [practitioner, date]);
  async function act(fn: () => Promise<void>) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }
  function navigate(id: string) {
    setView(id);
    setQuery("");
    setMobile(false);
  }
  function openBooking(s: Service) {
    if (!user) {
      setAuth(true);
      setNotice("Sign in to book your care.");
      return;
    }
    setReason("");
    setSharedRx("");
    setService(s);
    setPractitioner(
      catalog.practitioners.find((p) => p.category === s.category)?.id || "",
    );
    setDate(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
    setMode(s.modes[0]);
    setAddress("");
    setError("");
  }
  function add(p: Product) {
    setCart((c) => ({
      ...c,
      [p.id]: Math.min((c[p.id] || 0) + 1, 10, p.stock),
    }));
    setNotice(`${p.name} added to your bag.`);
  }
  function quantity(id: string, n: number) {
    setCart((c) => {
      const next = { ...c };
      if (n <= 0) delete next[id];
      else next[id] = Math.min(n, 10);
      return next;
    });
  }
  const count = Object.values(cart).reduce((a, b) => a + b, 0),
    cartProducts = catalog.products.filter((p) => cart[p.id]),
    total = cartProducts.reduce((n, p) => n + p.price * cart[p.id], 0);
  const upcoming = bookings
    .filter(
      (b) => b.status === "confirmed" && new Date(b.starts_at) > new Date(),
    )
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const current = modules.find((m) => m.id === view),
    filtered = catalog.products.filter((p) =>
      (p.name + " " + p.category).toLowerCase().includes(query.toLowerCase()),
    );
  const feedback = (
    <>
      {error && (
        <div role="alert" className="feedback error">
          {error}
          <button onClick={() => setError("")} aria-label="Dismiss error">
            <X size={16} />
          </button>
        </div>
      )}
      {notice && (
        <div role="status" className="feedback success">
          {notice}
          <button
            onClick={() => setNotice("")}
            aria-label="Dismiss notification"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </>
  );
  return (
    <div className="app-shell">
      {mobile && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={`sidebar ${mobile ? "visible" : ""}`}>
        <button
          className="brand"
          onClick={() => navigate("home")}
          aria-label="Abies home"
        >
          <img src="/abies-logo.jpg" alt="ABIES" />
          <span>AYURVEDA & WELLNESS</span>
        </button>
        <div className="nav-label">YOUR WELLNESS SPACE</div>
        <nav aria-label="Main navigation">
          <button
            className={view === "home" ? "active" : ""}
            onClick={() => navigate("home")}
          >
            <Home size={19} />
            Overview
          </button>
          {modules.map((m) => (
            <button
              key={m.id}
              className={view === m.id ? "active" : ""}
              onClick={() => navigate(m.id)}
            >
              <m.icon size={19} />
              {m.title}
            </button>
          ))}
        </nav>
        <div className="nav-label second">MY HEALTH</div>
        <nav aria-label="Health records">
          <button
            className={view === "bookings" ? "active" : ""}
            onClick={() => navigate("bookings")}
          >
            <CalendarDays size={19} />
            My appointments
            {upcoming.length > 0 && (
              <span className="nav-count">{upcoming.length}</span>
            )}
          </button>
          <button
            className={view === "records" ? "active" : ""}
            onClick={() => navigate("records")}
          >
            <ShieldCheck size={19} />
            Prescriptions & orders
          </button>
          {user && (
            <button
              onClick={() => navigate("profile")}
              className={view === "profile" ? "active" : ""}
            >
              <User size={19} />
              My profile
            </button>
          )}
          {user?.role === "admin" && (
            <button
              onClick={() => navigate("admin")}
              className={view === "admin" ? "active" : ""}
            >
              <ShieldCheck size={19} />
              Administration
            </button>
          )}
          {user?.role === "delivery" && (
            <button
              onClick={() => navigate("delivery")}
              className={view === "delivery" ? "active" : ""}
            >
              <Package size={19} />
              Delivery workspace
            </button>
          )}
          {user?.role === "clinician" && (
            <button
              onClick={() => navigate("clinician")}
              className={view === "clinician" ? "active" : ""}
            >
              <Stethoscope size={19} />
              Doctor workspace
            </button>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="care-note">
            <span className="icon-tile purple">
              <HeartPulse size={21} />
            </span>
            <strong>A little care, every day.</strong>
            <p>
              Your journey to wellbeing
              <br />
              starts with you.
            </p>
            <button onClick={() => navigate("doctor")}>
              Find your care <ArrowRight size={15} />
            </button>
          </div>
          <span className="sidebar-footer">
            <Leaf size={14} /> Rooted in nature. Made for you.
          </span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-btn mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu />
            </button>
            <span>Your wellness companion</span>
            <ChevronRight size={14} />
            <strong>
              {view === "home"
                ? "Overview"
                : current?.title ||
                  (
                    {
                      bookings: "My appointments",
                      records: "Health records",
                      clinician: "Doctor workspace",
                      admin: "Administration",
                      delivery: "Delivery workspace",
                      profile: "My profile",
                    } as Record<string, string>
                  )[view]}
            </strong>
          </div>
          <div className="top-actions">
            <span className="care-tag">
              <span /> Here for your wellbeing
            </span>
            <button
              className="bag-btn"
              aria-label={`Shopping bag, ${count} items`}
              onClick={() => setCartOpen(true)}
            >
              <ShoppingBag size={20} />
              {count > 0 && <b>{count}</b>}
            </button>
            <span className="top-divider" />
            {user ? (
              <>
                <button className="account" onClick={() => navigate("records")}>
                  <span className="avatar">
                    {user.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span>{user.name.split(" ")[0]}</span>
                </button>
                <button
                  className="icon-btn"
                  aria-label="Sign out"
                  onClick={() =>
                    act(async () => {
                      await api("/auth/logout", "POST");
                      setUser(null);
                      setNotice("You have signed out.");
                    })
                  }
                >
                  <LogOut size={17} />
                </button>
              </>
            ) : (
              <button className="sign-in" onClick={() => setAuth(true)}>
                <User size={17} /> Sign in
              </button>
            )}
          </div>
        </header>
        <main>
          {!auth && !service && !cartOpen && !video && feedback}
          {view === "home" && (
            <>
              <div className="welcome">
                <div>
                  <div className="eyebrow">WELLNESS BEGINS HERE</div>
                  <h1>
                    {user
                      ? `Welcome back, ${user.name.split(" ")[0]}`
                      : "A little closer to a healthier you."}
                    <span className="title-dot"> ✦</span>
                  </h1>
                  <p>
                    Thoughtful care for your body, mind, and everything in
                    between.
                  </p>
                </div>
                <span className="date-chip">
                  <CalendarDays size={16} /> Your health, all in one place
                </span>
              </div>
              <section className="hero">
                <div className="hero-copy">
                  <span className="hero-pill">
                    <span /> ROOTED IN AYURVEDA. FOCUSED ON YOU.
                  </span>
                  <h2>
                    Ancient wisdom.
                    <br />A healthier <em>tomorrow.</em>
                  </h2>
                  <p>
                    Discover a more natural way to care for yourself.
                    <br className="desktop-break" /> Expert consultations,
                    trusted therapies, and everyday wellness.
                  </p>
                  <div className="hero-actions">
                    <button
                      className="primary"
                      onClick={() => navigate("doctor")}
                    >
                      Book a consultation <ArrowRight size={17} />
                    </button>
                    <button
                      className="text-link"
                      onClick={() => navigate("store")}
                    >
                      Explore wellness <ArrowRight size={16} />
                    </button>
                  </div>
                  <div className="hero-trust">
                    <span>
                      <ShieldCheck size={16} /> Personalised care
                    </span>
                    <i />
                    <span>
                      <Leaf size={16} /> Ayurveda inspired
                    </span>
                  </div>
                </div>
                <div className="hero-art" aria-hidden="true">
                  <div className="orb orb-one" />
                  <div className="orb orb-two" />
                  <svg viewBox="0 0 380 350" className="botanical">
                    <defs>
                      <linearGradient id="leaf" x1="0" y1="0" x2="1" y2="1">
                        <stop stopColor="#638d65" />
                        <stop offset="1" stopColor="#243f34" />
                      </linearGradient>
                      <linearGradient id="bowl" x1="0" y1="0" x2="0" y2="1">
                        <stop stopColor="#a8754f" />
                        <stop offset="1" stopColor="#5c382b" />
                      </linearGradient>
                    </defs>
                    <ellipse
                      cx="205"
                      cy="310"
                      rx="137"
                      ry="18"
                      fill="#8f6a83"
                      opacity=".12"
                    />
                    <path
                      d="M199 262 Q183 143 250 47 M192 195 Q116 162 92 98 M198 235 Q265 175 296 128"
                      fill="none"
                      stroke="#4e6750"
                      strokeWidth="5"
                    />
                    {[
                      [225, 83, -22],
                      [203, 132, -20],
                      [199, 179, 6],
                      [150, 168, -65],
                      [112, 134, -47],
                      [244, 193, 28],
                      [275, 155, 30],
                    ].map(([x, y, r], i) => (
                      <g
                        key={i}
                        transform={`translate(${x} ${y}) rotate(${r})`}
                      >
                        <path
                          d="M0 0 C-54 -6 -65 -45 -55 -71 C-13 -63 10 -33 0 0"
                          fill="url(#leaf)"
                        />
                        <path
                          d="M0 0 L-47 -60"
                          stroke="#b7c59b"
                          strokeWidth="1"
                          opacity=".6"
                        />
                      </g>
                    ))}
                    <path
                      d="M105 267 Q115 333 207 327 Q296 327 307 267Z"
                      fill="url(#bowl)"
                    />
                    <ellipse
                      cx="206"
                      cy="265"
                      rx="102"
                      ry="23"
                      fill="#c89462"
                    />
                    <ellipse cx="206" cy="265" rx="89" ry="16" fill="#675631" />
                    <path
                      d="M149 261 Q191 226 262 254 Q228 277 149 261"
                      fill="#768b4e"
                    />
                    <path
                      d="M158 264 L251 250"
                      stroke="#c1bf7b"
                      strokeWidth="2"
                    />
                    <rect
                      x="258"
                      y="204"
                      width="20"
                      height="79"
                      rx="10"
                      fill="#bd916d"
                      transform="rotate(31 258 204)"
                    />
                  </svg>
                  <div className="floating-note">
                    <span>
                      <Leaf size={19} />
                    </span>
                    <div>
                      <strong>Nature meets nurture</strong>
                      <small>Care that feels like you.</small>
                    </div>
                  </div>
                  <span className="art-spark spark-one">✦</span>
                  <span className="art-spark spark-two">✧</span>
                </div>
              </section>
              <section className="services-section">
                <div className="section-heading">
                  <div>
                    <h2>Care for every part of you</h2>
                    <p>One destination. A world of wellbeing.</p>
                  </div>
                  <span className="subtle">Explore our services</span>
                </div>
                <div className="service-grid">
                  {modules.map((m) => (
                    <button
                      className="service-card"
                      key={m.id}
                      onClick={() => navigate(m.id)}
                    >
                      <span className={`icon-tile ${m.color}`}>
                        <m.icon size={24} />
                      </span>
                      <h3>{m.title}</h3>
                      <p>{m.short}</p>
                      <span className={`service-arrow ${m.color}`}>
                        <ArrowRight size={17} />
                      </span>
                    </button>
                  ))}
                </div>
              </section>
              <div className="lower-grid">
                <section className="popular">
                  <div className="section-heading">
                    <div>
                      <h2>Your everyday essentials</h2>
                      <p>Small rituals. A little more balance.</p>
                    </div>
                    <button
                      className="text-link"
                      onClick={() => navigate("store")}
                    >
                      View all <ArrowRight size={15} />
                    </button>
                  </div>
                  <div className="product-grid home-products">
                    {!loaded ? (
                      <div className="empty">
                        {error
                          ? "Catalog unavailable. Please reload to retry."
                          : "Loading your wellness essentials…"}
                      </div>
                    ) : (
                      catalog.products
                        .filter((p) => !p.prescription_required)
                        .slice(0, 3)
                        .map((p) => (
                          <article className="product-card" key={p.id}>
                            <Bottle product={p} />
                            <div className="product-info">
                              <span className="product-category">
                                {p.category}
                              </span>
                              <h3>{p.name}</h3>
                              <p>{p.subtitle}</p>
                              <div className="product-bottom">
                                <strong>{money(p.price)}</strong>
                                <button
                                  className="add-btn"
                                  aria-label={`Add ${p.name} to bag`}
                                  disabled={!p.stock}
                                  onClick={() => add(p)}
                                >
                                  <Plus size={17} />
                                </button>
                              </div>
                            </div>
                          </article>
                        ))
                    )}
                  </div>
                </section>
                <section className="appointment-panel">
                  <div className="section-heading">
                    <h2>Your next step</h2>
                    <CalendarDays size={19} />
                  </div>
                  {upcoming.length ? (
                    <>
                      <span className="status-pill">Upcoming appointment</span>
                      <h3>{upcoming[0].service_name}</h3>
                      <p>{upcoming[0].practitioner_name}</p>
                      <div className="appointment-time">
                        <Clock3 size={16} />
                        {when(upcoming[0].starts_at)}
                      </div>
                      <button
                        className="outline full"
                        onClick={() => navigate("bookings")}
                      >
                        View appointment <ArrowRight size={16} />
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="appointment-illustration">
                        <CalendarDays size={37} />
                        <span>
                          <Plus size={13} />
                        </span>
                      </div>
                      <h3>Make time for yourself</h3>
                      <p>
                        A conversation today can be the
                        <br />
                        first step to feeling better.
                      </p>
                      <button
                        className="outline full"
                        onClick={() => navigate("doctor")}
                      >
                        Find your appointment <ArrowRight size={16} />
                      </button>
                    </>
                  )}
                  <div className="gentle-note">
                    <Heart size={16} />
                    <span>A healthier routine starts with one small step.</span>
                  </div>
                </section>
              </div>
              <section className="bottom-banner">
                <span className="icon-tile green">
                  <Leaf size={21} />
                </span>
                <div>
                  <strong>Wellness is a journey. We’re here for yours.</strong>
                  <p>
                    Personal attention. Thoughtful choices. Care that connects.
                  </p>
                </div>
                <span className="banner-wordmark">
                  The Abies way <Sparkles size={17} />
                </span>
              </section>
            </>
          )}
          {current && view !== "store" && (
            <>
              <div className="page-heading">
                <span className={`icon-tile ${current.color}`}>
                  <current.icon size={25} />
                </span>
                <div>
                  <div className="eyebrow">PERSONALISED WELLNESS</div>
                  <h1>{current.title}</h1>
                  <p>
                    {current.short}. Choose your care and a time that works for
                    you.
                  </p>
                </div>
              </div>
              <div className="info-strip">
                <ShieldCheck size={18} /> Sample services and practitioners for
                demonstration. Appointment times are shown in UTC.
              </div>
              <div className="treatment-grid">
                {catalog.services
                  .filter((s) => s.category === view)
                  .map((s) => (
                    <article className="treatment-card" key={s.id}>
                      <div className={`treatment-visual ${current.color}`}>
                        <current.icon size={58} />
                        <span>THE ABIES CARE COLLECTION</span>
                      </div>
                      <div className="treatment-content">
                        <span className="eyebrow">
                          {s.modes.join(" / ")} CARE
                        </span>
                        <h2>{s.name}</h2>
                        <p>{s.description}</p>
                        <div className="treatment-meta">
                          <span>
                            <Clock3 size={15} />
                            {s.duration} minutes
                          </span>
                          <strong>{money(s.price)}</strong>
                        </div>
                        <button
                          className="primary full"
                          onClick={() => openBooking(s)}
                        >
                          Choose a slot <ArrowRight size={17} />
                        </button>
                      </div>
                    </article>
                  ))}
              </div>
              {!loaded && (
                <p className="empty">Waiting for the care catalog…</p>
              )}
            </>
          )}
          {view === "store" && (
            <>
              <div className="page-heading">
                <span className="icon-tile pink">
                  <Pill size={25} />
                </span>
                <div>
                  <div className="eyebrow">YOUR EVERYDAY WELLNESS</div>
                  <h1>Goodness, in your daily routine.</h1>
                  <p>Explore the Abies Ayurveda collection.</p>
                </div>
              </div>
              <div className="store-toolbar">
                <label className="search">
                  <Search size={18} />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search medicines or categories"
                    aria-label="Search medicines"
                  />
                </label>
                <button className="outline" onClick={() => setCartOpen(true)}>
                  <ShoppingBag size={17} /> Your bag ({count})
                </button>
              </div>
              <div className="info-strip">
                <Leaf size={18} /> Demonstration catalog. Products, prices and
                availability are sample data.
              </div>
              <div className="product-grid store-products">
                {filtered.map((p) => (
                  <article className="product-card" key={p.id}>
                    <Bottle product={p} />
                    <div className="product-info">
                      <span className="product-category">{p.category}</span>
                      <h3>{p.name}</h3>
                      <p>{p.subtitle}</p>
                      {p.prescription_required && (
                        <span className="rx-label">Prescription required</span>
                      )}
                      <div className="product-bottom">
                        <strong>{money(p.price)}</strong>
                        <button
                          className="outline compact"
                          disabled={!p.stock}
                          onClick={() => add(p)}
                        >
                          <Plus size={16} />
                          {p.stock ? "Add to bag" : "Out of stock"}
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              {loaded && !filtered.length && (
                <p className="empty">
                  No products match “{query}”. Try another search.
                </p>
              )}
            </>
          )}
          {view === "bookings" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">YOUR CARE, CONNECTED</div>
                  <h1>My appointments</h1>
                  <p>Your upcoming visits and care history, all together.</p>
                </div>
                <button className="primary" onClick={() => navigate("doctor")}>
                  Book a visit <Plus size={17} />
                </button>
              </div>
              {!user ? (
                <SignInPrompt onClick={() => setAuth(true)} />
              ) : !bookings.length ? (
                <div className="empty">
                  <CalendarDays size={32} />
                  <h3>A fresh start for your health</h3>
                  <p>Your appointments will appear here once booked.</p>
                </div>
              ) : (
                <div className="record-list">
                  {bookings.map((b) => (
                    <article className="record-card" key={b.id}>
                      <span className="icon-tile purple">
                        {b.mode === "video" ? <Video /> : <CalendarDays />}
                      </span>
                      <div className="record-main">
                        <h3>{b.service_name}</h3>
                        <p>{b.practitioner_name}</p>
                        <span>
                          <Clock3 size={14} />
                          {when(b.starts_at)} · {b.mode}
                        </span>
                      </div>
                      <span
                        className={`status-pill ${b.status === "cancelled" ? "muted" : ""}`}
                      >
                        {b.status}
                      </span>
                      {b.mode === "video" && b.status === "confirmed" && (
                        <button
                          className="outline compact"
                          onClick={() => {
                            setVideo(b);
                            setJoined(false);
                          }}
                        >
                          Video room demo
                        </button>
                      )}
                      {b.status === "confirmed" &&
                        new Date(b.starts_at) > new Date() && (
                          <button
                            disabled={busy}
                            className="text-link"
                            onClick={() =>
                              act(async () => {
                                await api(`/bookings/${b.id}/cancel`, "POST");
                                await refresh();
                                setNotice("Appointment cancelled.");
                              })
                            }
                          >
                            Cancel
                          </button>
                        )}
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
          {view === "records" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">YOUR PERSONAL HEALTH SPACE</div>
                  <h1>Prescriptions & orders</h1>
                  <p>
                    Keep your care records close, and your next steps clear.
                  </p>
                </div>
              </div>
              {!user ? (
                <SignInPrompt onClick={() => setAuth(true)} />
              ) : (
                <>
                  <section className="records-section">
                    <div className="section-heading">
                      <h2>My prescriptions</h2>
                      <label className="outline upload-label">
                        <Upload size={16} />
                        {busy ? "Uploading…" : "Upload prescription"}
                        <input
                          disabled={busy}
                          type="file"
                          accept="application/pdf,image/png,image/jpeg"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file)
                              act(async () => {
                                const f = new FormData();
                                f.append("file", file);
                                await api("/prescriptions/upload", "POST", f);
                                await refresh();
                                setNotice("Prescription uploaded securely.");
                              });
                            e.target.value = "";
                          }}
                        />
                      </label>
                    </div>
                    <p className="subtle">
                      PDF, PNG or JPEG up to 5 MB. Files remain private to your
                      account.
                    </p>
                    {!prescriptions.length ? (
                      <div className="empty">
                        Uploaded and clinician-issued prescriptions will appear
                        here.
                      </div>
                    ) : (
                      prescriptions.map((p) => (
                        <article className="record-card" key={p.id}>
                          <span className="icon-tile blue">
                            <ShieldCheck />
                          </span>
                          <div className="record-main">
                            <h3>{p.filename || "Clinician prescription"}</h3>
                            <p>{when(p.created_at)}</p>
                            {p.notes && (
                              <p className="prescription-notes">{p.notes}</p>
                            )}
                          </div>
                          {p.filename && (
                            <a
                              className="outline compact"
                              href={`/api/prescriptions/${p.id}/file`}
                            >
                              <ArrowDownToLine size={16} />
                              Download
                            </a>
                          )}
                        </article>
                      ))
                    )}
                  </section>
                  <section className="records-section">
                    <div className="section-heading">
                      <h2>My orders</h2>
                      <button
                        className="text-link"
                        onClick={() => navigate("store")}
                      >
                        Explore the store <ArrowRight size={16} />
                      </button>
                    </div>
                    {!orders.length ? (
                      <div className="empty">
                        Your orders will appear here after checkout.
                      </div>
                    ) : (
                      orders.map((o) => (
                        <article className="record-card" key={o.id}>
                          <span className="icon-tile orange">
                            <Package />
                          </span>
                          <div className="record-main">
                            <h3>Order {o.id.slice(0, 8).toUpperCase()}</h3>
                            <p>
                              {o.items
                                .map((i) => `${i.name} × ${i.quantity}`)
                                .join(", ")}
                            </p>
                            <span>{when(o.created_at)}</span>
                          </div>
                          <div>
                            <strong>{money(o.total)}</strong>
                            <p className="subtle">
                              {o.fulfillment_status.replaceAll("_", " ")}
                            </p>
                          </div>
                        </article>
                      ))
                    )}
                  </section>
                </>
              )}
            </>
          )}
          {view === "clinician" && user?.role === "clinician" && (
            <DoctorPanel />
          )}
          {view === "admin" && user?.role === "admin" && (
            <AdminPanel
              accountId={user.id}
              onCatalogChange={async () =>
                setCatalog(await api<Catalog>("/catalog"))
              }
            />
          )}
          {view === "delivery" && user?.role === "delivery" && (
            <DeliveryPanel />
          )}
          {view === "profile" && user && (
            <ProfilePanel
              onUpdate={(name) => setUser({ ...user, name })}
              onSignOut={() => {
                setUser(null);
                navigate("home");
                setNotice("Password changed. Please sign in again.");
                setAuth(true);
              }}
            />
          )}
          <footer className="page-footer">
            <span>© {new Date().getFullYear()} Abies. Care, naturally.</span>
            <span>
              Demonstration platform · No real payments or clinical care
            </span>
          </footer>
        </main>
      </div>
      {auth && (
        <Modal
          title={register ? "Begin your wellness journey" : "Welcome to Abies"}
          onClose={() => setAuth(false)}
        >
          {feedback}
          <p className="modal-intro">
            Your care, appointments and essentials in one place.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              act(async () => {
                const u = await api<Account>(
                  register ? "/auth/register" : "/auth/login",
                  "POST",
                  Object.fromEntries(f),
                );
                setUser(u);
                setAuth(false);
                setNotice("You’re signed in. Welcome to your wellness space.");
              });
            }}
          >
            {register && (
              <label>
                Full name
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={100}
                  autoComplete="name"
                />
              </label>
            )}
            <label>
              Email address
              <input name="email" type="email" required autoComplete="email" />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete={register ? "new-password" : "current-password"}
              />
            </label>
            <p className="subtle">Use at least 12 characters.</p>
            <button className="primary full" disabled={busy}>
              {busy ? "Please wait…" : register ? "Create account" : "Sign in"}
              <ArrowRight size={17} />
            </button>
          </form>
          <button
            className="auth-switch"
            onClick={() => setRegister(!register)}
          >
            {register
              ? "Already have an account? Sign in"
              : "New to Abies? Create an account"}
          </button>
        </Modal>
      )}
      {service && (
        <Modal
          title="Make time for your wellbeing"
          onClose={() => setService(null)}
        >
          {feedback}
          <div className="booking-summary">
            <span className="icon-tile purple">
              <CalendarDays />
            </span>
            <div>
              <h3>{service.name}</h3>
              <p>
                {service.duration} minutes · {money(service.price)}
              </p>
            </div>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              act(async () => {
                await api("/bookings", "POST", {
                  reason,
                  prescriptionId: sharedRx || undefined,
                  serviceId: service.id,
                  practitionerId: practitioner,
                  startsAt: slot,
                  mode,
                  address: mode === "home" ? address : undefined,
                });
                await refresh();
                setService(null);
                navigate("bookings");
                setNotice("Your appointment is confirmed.");
              });
            }}
          >
            <label>
              Choose your practitioner
              <select
                value={practitioner}
                onChange={(e) => setPractitioner(e.target.value)}
              >
                {catalog.practitioners
                  .filter((p) => p.category === service.category)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
            <div className="form-row">
              <label>
                Care setting
                <select value={mode} onChange={(e) => setMode(e.target.value)}>
                  {service.modes.map((m) => (
                    <option key={m} value={m}>
                      {m === "video"
                        ? "Video consultation"
                        : m === "home"
                          ? "Home visit"
                          : "In-clinic visit"}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Preferred date
                <input
                  required
                  type="date"
                  min={new Date().toISOString().slice(0, 10)}
                  max={new Date(Date.now() + 59 * 86400000)
                    .toISOString()
                    .slice(0, 10)}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
            </div>
            <label>
              Reason for visit (optional)
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={2000}
                placeholder="Tell your practitioner what you would like help with"
              />
            </label>
            <label>
              Share a prescription with your practitioner (optional)
              <select
                value={sharedRx}
                onChange={(e) => setSharedRx(e.target.value)}
              >
                <option value="">Do not share a prescription</option>
                {prescriptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.filename || "Prescription"} · {when(p.created_at)}
                  </option>
                ))}
              </select>
            </label>
            <fieldset>
              <legend>Available times · UTC</legend>
              <div className="slot-grid">
                {slots.map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={slot === s}
                    className={slot === s ? "selected" : ""}
                    onClick={() => setSlot(s)}
                  >
                    {s.slice(11, 16)}
                  </button>
                ))}
              </div>
              {!slots.length && (
                <p className="subtle">
                  {slotLoading
                    ? "Checking availability…"
                    : "No available times. Please choose another date."}
                </p>
              )}
            </fieldset>
            {mode === "home" && (
              <label>
                Home visit address
                <textarea
                  required
                  minLength={10}
                  maxLength={500}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="House, street, city and postal code"
                />
              </label>
            )}
            <div className="info-strip small-info">
              Demo booking · No payment will be collected.
            </div>
            <button className="primary full" disabled={busy || !slot}>
              {busy ? "Confirming…" : "Confirm appointment"}
              <Check size={17} />
            </button>
          </form>
        </Modal>
      )}
      {cartOpen && (
        <Modal
          title={`Your wellness bag (${count})`}
          onClose={() => setCartOpen(false)}
        >
          {feedback}
          {cartProducts.length ? (
            <>
              <div className="cart-lines">
                {cartProducts.map((p) => (
                  <div className="cart-line" key={p.id}>
                    <Bottle product={p} small />
                    <div className="cart-description">
                      <h3>{p.name}</h3>
                      <p>{money(p.price)}</p>
                      {p.prescription_required && (
                        <span className="rx-label">Prescription required</span>
                      )}
                    </div>
                    <div className="quantity">
                      <button
                        aria-label={`Remove one ${p.name}`}
                        onClick={() => quantity(p.id, cart[p.id] - 1)}
                      >
                        <Minus size={14} />
                      </button>
                      <span>{cart[p.id]}</span>
                      <button
                        aria-label={`Add one ${p.name}`}
                        disabled={cart[p.id] >= Math.min(10, p.stock)}
                        onClick={() => quantity(p.id, cart[p.id] + 1)}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <button
                      aria-label={`Remove ${p.name}`}
                      className="icon-btn"
                      onClick={() => quantity(p.id, 0)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="cart-total">
                <span>Total</span>
                <strong>{money(total)}</strong>
              </div>
              <p className="subtle">
                INR · No shipping or payment charge in this demo.
              </p>
              {user ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    act(async () => {
                      checkoutKey.current ||= crypto.randomUUID();
                      await api("/orders", "POST", {
                        items: cartProducts.map((p) => ({
                          productId: p.id,
                          quantity: cart[p.id],
                        })),
                        address,
                        prescriptionId: rx || undefined,
                        idempotencyKey: checkoutKey.current,
                      });
                      setCart({});
                      setCartOpen(false);
                      await refresh();
                      navigate("records");
                      setNotice("Demo order placed. No payment was collected.");
                    });
                  }}
                >
                  <label>
                    Delivery address
                    <textarea
                      required
                      minLength={10}
                      maxLength={500}
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="House, street, city and postal code"
                    />
                  </label>
                  <label>
                    Attach a prescription{" "}
                    {cartProducts.some((p) => p.prescription_required)
                      ? "(required)"
                      : "(optional)"}
                    <select
                      required={cartProducts.some(
                        (p) => p.prescription_required,
                      )}
                      value={rx}
                      onChange={(e) => setRx(e.target.value)}
                    >
                      <option value="">Select from your prescriptions</option>
                      {prescriptions.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.filename ||
                            `Clinician prescription · ${when(p.created_at)}`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => {
                      setCartOpen(false);
                      navigate("records");
                    }}
                  >
                    Upload a prescription in your records{" "}
                    <ArrowRight size={15} />
                  </button>
                  <div className="info-strip small-info">
                    Prescription products await review. Demo orders are not
                    shipped.
                  </div>
                  <button className="primary full" disabled={busy}>
                    {busy ? "Placing order…" : "Place demo order"}
                    <ArrowRight size={17} />
                  </button>
                </form>
              ) : (
                <button
                  className="primary full"
                  onClick={() => {
                    setCartOpen(false);
                    setAuth(true);
                  }}
                >
                  Sign in to checkout <ArrowRight size={17} />
                </button>
              )}
            </>
          ) : (
            <div className="empty">
              <ShoppingBag size={35} />
              <h3>A little room for wellness</h3>
              <p>Your bag is empty. Explore our everyday essentials.</p>
              <button
                className="primary"
                onClick={() => {
                  setCartOpen(false);
                  navigate("store");
                }}
              >
                Explore medicines
              </button>
            </div>
          )}
        </Modal>
      )}
      {video && (
        <Modal
          title="Consultation room · demonstration"
          onClose={() => setVideo(null)}
        >
          <div className="video-stage">
            <span className="avatar large">
              {joined ? "✓" : video.practitioner_name.slice(0, 1)}
            </span>
            <h3>
              {joined ? "You’re in the demo room" : video.practitioner_name}
            </h3>
            <p>
              {joined
                ? "This preview does not connect to a clinician."
                : "A quiet space for your care conversation."}
            </p>
            <span className="video-badge">
              <Video size={14} /> Interface preview
            </span>
          </div>
          <p className="modal-intro">
            {when(video.starts_at)}. No camera, microphone or real call is
            active.
          </p>
          <button className="primary full" onClick={() => setJoined(!joined)}>
            {joined ? "Leave demo room" : "Enter demo room"}
            <Video size={17} />
          </button>
        </Modal>
      )}
    </div>
  );
}
function SignInPrompt({ onClick }: { onClick: () => void }) {
  return (
    <div className="empty">
      <ShieldCheck size={35} />
      <h3>Your personal care space</h3>
      <p>Sign in to securely access your appointments and records.</p>
      <button className="primary" onClick={onClick}>
        Sign in <ArrowRight size={16} />
      </button>
    </div>
  );
}
