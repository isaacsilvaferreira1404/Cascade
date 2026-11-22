import "./style.css";
import { desk } from "./staff-desk.js";
import { loginScreen } from "./auth-view.js";
import { accountForm, adminEmail } from "./team-accounts.js";
let registrationName = "";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  sendEmailVerification,
  signOut,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  query,
  where,
  runTransaction,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
const ready = Object.values(config).every(Boolean);
const auth = ready ? getAuth(initializeApp(config)) : null,
  db = ready ? getFirestore(auth.app) : null;
const services = [
  ["Corte", 40, 60],
  ["Sobrancelha", 10, 10],
  ["Corte + sobrancelha", 50, 60],
  ["Barba desenhada", 30, 40],
  ["Corte e barba", 65, 80],
  ["Corte + barba + sobrancelha", 70, 80],
  ["Penteado", 30, 30],
  ["Luzes", 80, 30],
  ["Platinado", 125, 30],
  ["Relaxamento", 30, 15],
  ["Botox", 70, 60],
  ["Progressiva", 80, 90],
  ["Nudreds", 60, 80],
  ["Lavagem", 20, 10],
  ["Skin care", 25, 30],
  ["Pezinho", 15, 15],
  ["Hidratação", 25, 20],
  ["Dedoliss", 35, 30],
  ["Coloração", 35, 40],
  ["Fio a fio", 110, 60],
];
const plans = {
  cabelo: { name: "Club Cabelo", price: 149.99, covered: ["Corte"] },
  barba: { name: "Club Barba", price: 114.99, covered: ["Barba desenhada"] },
  completo: {
    name: "Club Completo",
    price: 219.99,
    covered: ["Corte", "Barba desenhada", "Corte e barba"],
  },
};
let catalog = services.map(([name, price, duration]) => ({
  id: name,
  name,
  price,
  duration,
}));
const mins = (t) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const clock = (n) =>
  String(Math.floor(n / 60)).padStart(2, "0") +
  ":" +
  String(n % 60).padStart(2, "0");
const app = document.getElementById("app");
let user = null,
  profile = null,
  barbers = [],
  appointments = [],
  slots = [],
  locks = [],
  chosenService = null,
  chosenBarber = null,
  chosenSlot = null;
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const money = (n) =>
  Number(n || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const fmt = (t) =>
  t ? new Date(t + "T12:00:00").toLocaleDateString("pt-BR") : "";
const el = (id) => document.getElementById(id);
const notice = (s) => {
  let n = el("notice");
  if (n) n.textContent = s;
};
function shell(content) {
  app.innerHTML =
    '<header><div class="brand"><span>✂</span> CAS<span>CADE</span><small>BARBEARIA · DESDE 2016</small></div><nav><a href="#" id="home">Início</a><a href="#club">Cascade Club</a><button id="authBtn">' +
    (user ? "Minha conta" : "Entrar") +
    "</button>" +
    (profile?.role === "admin" ? '<button id="manageLoginsBtn" type="button">Gerenciar logins</button>' : "") +
    "</nav></header><main>" +
    content +
    "</main><footer>CASCADE BARBEARIA · ESTILO E PRECISÃO</footer>";
  el("home").onclick = (e) => {
    e.preventDefault();
    render();
  };
  el("authBtn").onclick = () => (user ? accountView() : authView());
  if (el("manageLoginsBtn")) el("manageLoginsBtn").onclick = () => { accountView(); el("openAdmin")?.click(); el("adminLogins")?.scrollIntoView({behavior:"smooth",block:"start"}); };
}
function authView() {
  loginScreen({
    shell,
    auth,
    register: async (name, create) => {
      registrationName = name;
      try {
        await create();
      } catch (e) {
        registrationName = "";
        throw e;
      }
    },
  });
}
function accountView() {
  if (!user) {
    authView();
    return;
  }
  shell(
    '<section class="section account-section"><div class="panel account-card"><div class="eyebrow">PERFIL CASCADE</div><h2>Minha conta</h2><p class="muted">' +
      esc(user.email) +
      '</p><form id="profileForm"><label for="profileName">Nome</label><input id="profileName" maxlength="80" required value="' +
      esc(profile?.name || "") +
      '"><label for="profilePhone">Número de celular</label><input id="profilePhone" type="tel" inputmode="tel" maxlength="20" placeholder="(11) 99999-9999" value="' +
      esc(profile?.phone || "") +
      '"><button type="submit">Salvar alterações</button></form><p id="notice" role="status"></p>' +
      (profile?.role === "admin"
        ? '<div class="account-actions"><button id="openAdmin">Administração</button></div>'
        : "") +
      '<div class="account-actions"><button id="logout" class="secondary">Sair da conta</button><button id="backHome" class="secondary">Voltar ao início</button></div></div><div id="adminModal" class="admin-modal" hidden></div></section>',
  );
  el("profileForm").onsubmit = async (e) => {
    e.preventDefault();
    const name = el("profileName").value.trim(),
      phone = el("profilePhone").value.trim();
    if (name.length < 2) {
      notice("Informe um nome válido.");
      return;
    }
    if (phone && phone.replace(/\D/g, "").length < 10) {
      notice("Informe um telefone com DDD.");
      return;
    }
    try {
      await updateDoc(doc(db, "users", user.uid), { name, phone });
      profile.name = name;
      profile.phone = phone;
      notice("Dados atualizados com sucesso.");
    } catch (err) {
      notice("Não foi possível salvar: " + err.message);
    }
  };
  if (user.email === adminEmail && !user.emailVerified) {
    el("notice").insertAdjacentHTML(
      "beforebegin",
      '<p>Confirme seu e-mail para acessar a administração. Após verificar, saia e entre novamente.</p><button id="verify">Enviar verificação</button>',
    );
    el("verify").onclick = async () => {
      try {
        await sendEmailVerification(user);
        notice("Verificação enviada. Confira sua caixa de entrada.");
      } catch {
        notice(
          "Não foi possível enviar a verificação. Tente novamente mais tarde.",
        );
      }
    };
  }
  el("logout").onclick = () => signOut(auth);
  el("backHome").onclick = render;
  if (el("openAdmin"))
    el("openAdmin").onclick = () => {
      const modal = el("adminModal");
      modal.hidden = false;
      modal.innerHTML =
        '<div class="admin-dialog panel"><div class="dialog-heading"><h2>Administração</h2><button id="closeAdmin" class="secondary" type="button">Fechar ✕</button></div><p class="muted">Gerencie procedimentos, barbeiros, horários e assinaturas.</p><div id="admin"></div></div>';
      el("closeAdmin").onclick = () => {
        modal.hidden = true;
        modal.innerHTML = "";
      };
      admin();
      el("admin").insertAdjacentHTML(
        "afterbegin",
        '<details open><summary>Barbeiros da equipe</summary><div id="teamAccount"></div></details>',
      );
      accountForm(el("teamAccount"), "barber", { auth, db, onSaved: load });
    };
}
async function load() {
  if (!user) return;
  const p = await getDoc(doc(db, "users", user.uid));
  profile = p.exists()
    ? p.data()
    : { name: user.email, role: "client", club: "none", clubActive: false };
  if (!p.exists()) {
    profile = {
      name: registrationName || user.displayName || "Cliente",
      email: user.email,
      role: "client",
      isAdmin: false,
      phone: "",
      club: "none",
      clubActive: false,
    };
    await setDoc(p.ref, profile);
  }
  registrationName = "";
  const token = await user.getIdTokenResult();
  profile.role =
    profile.isAdmin === true && token.claims.email === adminEmail && token.claims.email_verified === true
      ? "admin"
      : profile.role === "barber"
        ? "barber"
        : "client";
  const b = await getDocs(
    query(collection(db, "users"), where("role", "==", "barber")),
  );
  barbers = b.docs.map((x) => ({ id: x.id, ...x.data() }));
  const aq =
    profile.role === "admin"
      ? collection(db, "appointments")
      : query(
          collection(db, "appointments"),
          where(
            profile.role === "barber" ? "barberId" : "clientId",
            "==",
            user.uid,
          ),
        );
  const a = await getDocs(aq);
  appointments = a.docs.map((x) => ({ id: x.id, ...x.data() }));
  const sv = await getDocs(collection(db, "services"));
  catalog = [
    ...services.map(([name, price, duration]) => ({
      id: name,
      name,
      price,
      duration,
    })),
    ...sv.docs.map((x) => ({ id: x.id, ...x.data() })),
  ].filter((x) => x.active !== false);
  const s = await getDocs(collection(db, "slots"));
  slots = s.docs.map((x) => ({ id: x.id, ...x.data() }));
  const lk = await getDocs(collection(db, "bookingLocks"));
  locks = lk.docs.map((x) => ({ id: x.id, ...x.data() }));
}
function covered(s) {
  return profile?.clubActive && plans[profile.club]?.covered.includes(s);
}
function render() {
  shell(
    '<section class="hero"><div><div class="eyebrow">BARBEARIA CASCADE · DESDE 2016</div><h1>Seu estilo.<br><em>Nossa assinatura.</em></h1><p>Cortes, barba e cuidados masculinos com agendamento online.</p><a class="cta" href="#agenda">Agendar agora</a></div><div class="heroart">✂<small>CASCADE</small></div></section><section id="agenda" class="section"><div class="eyebrow">AGENDE SEU HORÁRIO</div><h2>Escolha seu serviço</h2><div class="servicegrid">' +
      catalog
        .map(
          ({ name, price, duration: min }) =>
            '<button class="service" data-service="' +
            esc(name) +
            '"><b>' +
            esc(name) +
            "</b><span>" +
            money(price) +
            " · " +
            min +
            " min</span></button>",
        )
        .join("") +
      '</div><div id="booking"></div></section><section id="club" class="section"><div class="eyebrow">BENEFÍCIOS EXCLUSIVOS</div><h2>Cascade Club</h2><div class="cards">' +
      Object.entries(plans)
        .map(
          ([key, p]) =>
            '<article class="plan"><h3>' +
            p.name +
            "</h3><strong>" +
            money(p.price) +
            "</strong><p>mensalidade</p><p>" +
            p.covered.join(" · ") +
            "</p></article>",
        )
        .join("") +
      '</div><p class="muted">Planos ativados pela administração. Serviços incluídos não geram cobrança adicional.</p></section>' +
      (user
        ? '<section class="section"><h2>Minha área</h2><div id="dashboard"></div></section>'
        : '<section class="section panel"><h2>Entre para agendar</h2><button id="enter">Login ou cadastro</button></section>') +
      '<p id="notice"></p>',
  );
  document
    .querySelectorAll("[data-service]")
    .forEach((b) => (b.onclick = () => selectService(b.dataset.service)));
  if (el("enter")) el("enter").onclick = authView;
  if (user) dashboard();
}
function selectService(name) {
  chosenService = name;
  chosenBarber = null;
  chosenSlot = null;
  const box = el("booking");
  box.scrollIntoView({ block: "start" });
  document
    .querySelectorAll("[data-service]")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.service === name)),
    );
  if (!user) {
    box.innerHTML =
      '<div class="panel"><p>Entre para escolher barbeiro e horário.</p><button id="goLogin">Entrar</button></div>';
    el("goLogin").onclick = authView;
    return;
  }
  const service = catalog.find((x) => x.name === name);
  box.innerHTML =
    '<div class="panel"><h3>' +
    esc(name) +
    "</h3><p>" +
    (covered(name) ? "Incluído no Cascade Club" : money(service.price)) +
    " · " +
    service.duration +
    ' minutos</p><h4>Escolha seu barbeiro</h4><div class="barbergrid">' +
    barbers
      .map(
        (b) =>
          '<button class="barber-card" data-barber="' +
          esc(b.id) +
          '"><b>' +
          esc(b.name) +
          "</b><small>Ver horários</small></button>",
      )
      .join("") +
    "</div>" +
    (barbers.length ? "" : "<p>Nenhum barbeiro cadastrado.</p>") +
    '<div id="bookingDate"></div><div id="available"></div></div>';
  document.querySelectorAll("[data-barber]").forEach(
    (btn) =>
      (btn.onclick = () => {
        chosenBarber = btn.dataset.barber;
        document
          .querySelectorAll("[data-barber]")
          .forEach((x) => x.classList.toggle("selected", x === btn));
        el("bookingDate").innerHTML =
          '<label for="date">Escolha o dia</label><input id="date" type="date" min="' +
          today() +
          '">';
        el("date").value =
          slots
            .filter(
              (s) =>
                s.barberId === chosenBarber &&
                s.active !== false &&
                s.date >= today(),
            )
            .map((s) => s.date)
            .sort()[0] || today();
        refreshSlots();
        el("date").onchange = refreshSlots;
      }),
  );
}
function refreshSlots() {
  const date = el("date")?.value;
  const service = catalog.find((x) => x.name === chosenService);
  if (!date || !chosenBarber || !service) return;
  const duration = Number(service.duration);
  const schedule = barbers.find((x) => x.id === chosenBarber);
  chosenSlot = null;
  const start = mins(schedule?.workStart || "00:00"),
    end = schedule?.workEnd ? mins(schedule.workEnd) : 1440;
  const now = mins(
    new Date().toLocaleTimeString("en-GB", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
    }),
  );
  const occupied = [
    ...appointments
      .filter(
        (a) =>
          a.barberId === chosenBarber &&
          a.date === date &&
          a.status !== "cancelled",
      )
      .map((a) => ({
        start: mins(a.time),
        end:
          mins(a.time) +
          Number(
            a.duration ||
              catalog.find((x) => x.name === a.service)?.duration ||
              60,
          ),
      })),
    ...locks
      .filter((l) => l.barberId === chosenBarber && l.date === date)
      .map((l) => ({ start: l.minute, end: l.minute + 5 })),
  ];
  const open = slots
    .filter(
      (x) =>
        x.barberId === chosenBarber && x.date === date && x.active !== false,
    )
    .map((x) => ({
      start: mins(x.time),
      end: mins(x.time) + Number(x.duration || 0),
    }));
  let available = [];
  for (let t = start; t + duration <= end;) {
    const collision = occupied.find((o) => t < o.end && t + duration > o.start);
    if (collision) {
      t = Math.ceil(collision.end / 5) * 5;
      continue;
    }
    const matches = open.find((o) => o.start <= t && o.end >= t + duration);
    if (matches && date >= today() && (date !== today() || t > now))
      available.push({
        time: clock(t),
        slot: slots.find(
          (x) =>
            x.barberId === chosenBarber &&
            x.date === date &&
            x.active !== false &&
            mins(x.time) <= t &&
            mins(x.time) + Number(x.duration || 0) >= t + duration,
        ),
      });
    t += matches && (date !== today() || t > now) ? 15 : 5;
  }
  el("available").innerHTML =
    "<h3>Horários disponíveis</h3>" +
    (available.length
      ? '<div class="times">' +
        available
          .map(
            (x, i) =>
              '<button class="time" data-time-index="' +
              i +
              '">' +
              x.time +
              "</button>",
          )
          .join("") +
        "</div>"
      : "<p>Nenhum horário disponível nesta data. O barbeiro precisa disponibilizar a jornada.</p>") +
    '<button id="confirm" disabled>Confirmar agendamento</button>';
  document.querySelectorAll("[data-time-index]").forEach(
    (btn) =>
      (btn.onclick = () => {
        const x = available[Number(btn.dataset.timeIndex)];
        chosenSlot = { id: x.slot.id, time: x.time };
        document
          .querySelectorAll("[data-time-index]")
          .forEach((y) => y.classList.toggle("selected", y === btn));
        el("confirm").disabled = false;
      }),
  );
  el("confirm").onclick = book;
}
async function book() {
  if (!chosenSlot) return;
  el("confirm").disabled = true;
  try {
    const selected = chosenSlot;
    const ref = doc(db, "slots", selected.id);
    const service = catalog.find((x) => x.name === chosenService);
    const start = mins(selected.time),
      duration = Number(service.duration);
    const steps = Array.from(
      { length: Math.ceil(duration / 5) },
      (_, i) => start + i * 5,
    );
    const lockRefs = steps.map((minute) =>
      doc(
        db,
        "bookingLocks",
        chosenBarber + "_" + el("date").value + "_" + minute,
      ),
    );
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const existing = await Promise.all(lockRefs.map((x) => tx.get(x)));
      if (
        !snap.exists() ||
        snap.data().active === false ||
        snap.data().barberId !== chosenBarber ||
        snap.data().date !== el("date").value ||
        existing.some((x) => x.exists())
      )
        throw Error("Horário indisponível");
      const slot = snap.data();
      if (
        start < mins(slot.time) ||
        start + duration > mins(slot.time) + Number(slot.duration)
      )
        throw Error("Fora da jornada");
      const price = covered(chosenService) ? 0 : service.price;
      const appointmentRef = doc(collection(db, "appointments"));
      lockRefs.forEach((lockRef, i) =>
        tx.set(lockRef, {
          barberId: chosenBarber,
          date: slot.date,
          minute: steps[i],
          clientId: user.uid,
          appointmentId: appointmentRef.id,
        }),
      );
      tx.set(appointmentRef, {
        clientId: user.uid,
        barberId: chosenBarber,
        slotId: selected.id,
        service: chosenService,
        date: slot.date,
        time: selected.time,
        duration,
        price,
        status: "scheduled",
        clubApplied: price === 0,
        createdAt: serverTimestamp(),
      });
    });
    await load();
    render();
    notice("Agendamento confirmado!");
  } catch (err) {
    notice("Não foi possível reservar: " + err.message);
    if (el("confirm")) el("confirm").disabled = false;
  }
}
function dashboard() {
  const mine = appointments
    .filter((a) => a.clientId === user.uid)
    .sort((a, b) => b.date.localeCompare(a.date));
  let html =
    '<div class="panel"><p>Olá, ' +
    esc(profile.name) +
    " · Perfil: " +
    esc(profile.role) +
    "</p><p>Clube: " +
    (profile.clubActive && plans[profile.club]
      ? plans[profile.club].name
      : "Sem assinatura ativa") +
    "</p><h3>Meus agendamentos</h3>" +
    (mine
      .map(
        (a) =>
          '<div class="entry">' +
          esc(a.service) +
          " · " +
          fmt(a.date) +
          " " +
          esc(a.time) +
          " · " +
          money(a.price) +
          " · " +
          esc(a.status) +
          (a.status === "scheduled"
            ? '<button data-cancel="' + esc(a.id) + '">Cancelar</button>'
            : "") +
          "</div>",
      )
      .join("") || "<p>Você ainda não tem agendamentos.</p>") +
    "</div>";
  if (["barber", "admin"].includes(profile.role))
    html +=
      '<div class="panel"><h3>Agenda profissional</h3><div id="staff"></div></div>';
  el("dashboard").innerHTML = html;
  document.querySelectorAll("[data-cancel]").forEach(
    (b) =>
      (b.onclick = async () => {
        const a = appointments.find((x) => x.id === b.dataset.cancel);
        await runTransaction(db, async (tx) => {
          const refs = Array.from(
            { length: Math.ceil(Number(a.duration || 60) / 5) },
            (_, i) =>
              doc(
                db,
                "bookingLocks",
                a.barberId + "_" + a.date + "_" + (mins(a.time) + i * 5),
              ),
          );
          const snaps = await Promise.all(refs.map((x) => tx.get(x)));
          tx.update(doc(db, "appointments", a.id), { status: "cancelled" });
          refs.forEach((x, i) => {
            if (snaps[i].exists() && snaps[i].data().appointmentId === a.id)
              tx.delete(x);
          });
        });
        await load();
        render();
      }),
  );
  if (el("staff")) staff();
}
function staff() {
  const list =
    profile.role === "admin"
      ? appointments
      : appointments.filter((a) => a.barberId === user.uid);
  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const week = weekStart.toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  });
  const revenue = list
    .filter((a) => a.status === "completed" && a.date >= week)
    .reduce((sum, a) => sum + Number(a.price || 0), 0);
  el("staff").innerHTML =
    "<h4>Faturamento da semana: " +
    money(revenue) +
    '</h4><p class="muted">Atendimentos concluídos, sem repasse de mensalidades do clube.</p><h4>Agendamentos</h4>' +
    list
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(
        (a) =>
          '<div class="entry">' +
          fmt(a.date) +
          " " +
          esc(a.time) +
          " · " +
          esc(a.service) +
          " · " +
          (a.source === "walk-in"
            ? "Avulso · " + esc(a.clientName || "Sem cliente") + " · "
            : "") +
          (a.status === "completed"
            ? "Concluído"
            : a.status === "scheduled"
              ? "Agendado"
              : "Cancelado") +
          (a.status === "scheduled"
            ? '<button data-done="' + esc(a.id) + '">Concluir</button>'
            : "") +
          "</div>",
      )
      .join("") +
    '<div id="desk"></div><p role="status" id="deskStatus"></p>';
  desk(el("desk"), {
    db,
    auth,
    user,
    profile,
    barbers,
    slots,
    catalog,
    esc,
    mins,
    today,
    clock,
    plans,
    load,
    refresh: async (text) => {
      await load();
      staff();
      el("deskStatus").textContent = text;
    },
  });
  document.querySelectorAll("[data-done]").forEach(
    (b) =>
      (b.onclick = async () => {
        await updateDoc(doc(db, "appointments", b.dataset.done), {
          status: "completed",
        });
        await load();
        render();
      }),
  );
}
function admin() {
  el("admin").innerHTML =
    '<p>Administrador: gerencie barbeiros, procedimentos e assinaturas.</p><section id="adminLogins"><h4>Gerenciar logins</h4><p class="muted">Contas cadastradas no Firestore. Senhas não são exibidas.</p><button type="button" id="listLogins">Carregar contas</button><div id="loginList" role="status"></div></section><h4>Configurações do administrador</h4><p class="muted">Permissões salvas no Firestore. Apenas administradores podem modificar funções de outros usuários.</p><form id="adminAccessForm"><label>E-mail da conta cadastrada<input id="adminAccessEmail" type="email" required placeholder="E-mail do usuário"></label><label>Permissão<select id="adminAccessValue"><option value="true">Administrador (true)</option><option value="false">Usuário comum (false)</option></select></label><button type="submit">Salvar permissão</button><p id="adminAccessStatus" role="status"></p></form><h4>Novo procedimento</h4><form id="serviceForm"><input id="serviceName" placeholder="Nome do procedimento" required><input id="servicePrice" type="number" min="0" step="0.01" placeholder="Preço em R$" required><input id="serviceDuration" type="number" min="5" max="480" placeholder="Duração em minutos" required><button>Adicionar procedimento</button></form><h4>Definir barbeiro e jornada</h4><form id="roles"><input type="email" id="target" placeholder="E-mail do usuário já cadastrado" required><select id="role"><option value="client">Cliente</option><option value="barber">Barbeiro</option></select><input type="time" id="workStart" value="08:00"><input type="time" id="workEnd" value="20:00"><select id="club"><option value="none">Sem clube</option>' +
    Object.entries(plans)
      .map(([k, p]) => '<option value="' + k + '">' + p.name + "</option>")
      .join("") +
    '</select><label><input type="checkbox" id="active"> Assinatura ativa</label><button>Atualizar cadastro</button></form><p class="muted">Use este formulário para alterar a função ou assinatura de uma conta existente.</p>';
  el("listLogins").onclick = async () => {
    const target = el("loginList");
    target.textContent = "Carregando contas...";
    try {
      const result = await getDocs(collection(db, "users"));
      const entries = result.docs.map((entry) => ({id:entry.id, ...entry.data()}));
      target.innerHTML = entries.length
        ? '<div class="login-entries">' + entries.map((entry) =>
            '<div class="panel" style="padding:12px;margin:8px 0"><strong>' + esc(entry.name || "Sem nome") + '</strong><p class="muted">' + esc(entry.email || "Sem e-mail") + '</p><p>' + (entry.isAdmin === true ? "Administrador" : entry.role === "barber" ? "Barbeiro" : "Cliente") + '</p><button type="button" class="secondary" data-login-email="' + esc(entry.email || "") + '">Editar permissão</button></div>'
          ).join("") + '</div>'
        : '<p>Nenhuma conta cadastrada no Firestore.</p>';
      target.querySelectorAll("[data-login-email]").forEach((button) => {
        button.onclick = () => {
          el("adminAccessEmail").value = button.dataset.loginEmail;
          el("adminAccessForm").scrollIntoView({behavior:"smooth",block:"center"});
        };
      });
    } catch (err) {
      target.textContent = "Não foi possível carregar as contas: " + (err.message || "Erro de acesso.");
    }
  };
  el("adminAccessForm").onsubmit = async (e) => {
    e.preventDefault();
    const status = el("adminAccessStatus");
    const email = el("adminAccessEmail").value.trim().toLowerCase();
    const isAdmin = el("adminAccessValue").value === "true";
    status.textContent = "Salvando...";
    try {
      if (email === user.email?.toLowerCase() && !isAdmin) throw Error("Não é permitido retirar sua própria permissão de administrador.");
      const results = await getDocs(query(collection(db, "users"), where("email", "==", email)));
      if (results.empty) throw Error("Conta não encontrada no Firestore.");
      await updateDoc(results.docs[0].ref, { isAdmin });
      status.textContent = "Permissão atualizada no Firestore.";
    } catch (err) {
      status.textContent = err.message || "Não foi possível atualizar a permissão.";
    }
  };
  el("serviceForm").onsubmit = async (e) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, "services"), {
        name: el("serviceName").value.trim(),
        price: Number(el("servicePrice").value),
        duration: Number(el("serviceDuration").value),
        active: true,
      });
      await load();
      render();
      notice("Procedimento adicionado.");
    } catch (err) {
      notice(err.message);
    }
  };
  el("roles").onsubmit = async (e) => {
    e.preventDefault();
    try {
      const email = el("target").value.trim().toLowerCase();
      const q = await getDocs(
        query(collection(db, "users"), where("email", "==", email)),
      );
      if (q.empty)
        throw Error(
          "Usuário não encontrado. Primeiro ele precisa criar a conta.",
        );
      if (mins(el("workStart").value) >= mins(el("workEnd").value))
        throw Error("Jornada inválida.");
      await updateDoc(q.docs[0].ref, {
        role: el("role").value,
        club: el("club").value,
        clubActive: el("active").checked,
        workStart: el("workStart").value,
        workEnd: el("workEnd").value,
      });
      await load();
      render();
      notice("Cadastro atualizado.");
    } catch (err) {
      notice(err.message);
    }
  };
}
if (!ready) {
  shell(
    '<section class="panel"><h1>CASCADE</h1><p>Site pronto para conectar ao Firebase. Configure as variáveis VITE_FIREBASE_* na Vercel.</p></section>',
  );
} else
  onAuthStateChanged(auth, async (u) => {
    user = u;
    profile = null;
    barbers = [];
    appointments = [];
    slots = [];
    locks = [];
    if (!u) {
      chosenService = null;
      render();
      return;
    }
    try {
      await load();
      render();
      if (chosenService) selectService(chosenService);
      if (u.email === adminEmail && !u.emailVerified) accountView();
    } catch (error) {
      const message = error.code === "permission-denied"
        ? "Você entrou na conta, mas o Firestore não permitiu carregar sua agenda. Peça à administração para verificar as regras de acesso."
        : error.code === "unavailable"
          ? "O banco de dados está temporariamente inacessível. Verifique sua conexão e tente novamente."
          : "Não foi possível carregar a agenda. Tente novamente.";
      shell(
        `<section class="panel narrow"><h2>Agenda indisponível</h2><p role="alert">${message}</p><button id="retry">Tentar novamente</button> <button class="secondary" id="exit">Sair</button></section>`,
      );
      el("retry").onclick = () => location.reload();
      el("exit").onclick = () => signOut(auth);
    }
  });
