import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  where,
  updateDoc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { accountForm } from "./team-accounts.js";
export function desk(target, ctx) {
  const {
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
  } = ctx;
  const admin = profile.role === "admin",
    team = admin ? barbers : barbers.filter((b) => b.id === user.uid);
  const options = (items) =>
    items
      .map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`)
      .join("");
  const selectTeam = `<label>Barbeiro<select name="barber" required>${options(team.map((b) => [b.id, b.name]))}</select></label>`;
  const dateInput = `<label>Data<input type="date" name="date" required value="${today()}"></label>`;
  target.innerHTML = `<div class="desk-tabs" aria-label="Ferramentas da equipe"><button data-panel="schedule">Horários</button><button data-panel="walk">Atendimento avulso</button><button data-panel="client">Criar cliente</button>${admin ? '<button data-panel="barber">Adicionar barbeiro</button>' : ""}</div><div class="desk-body"></div>`;
  const body = target.querySelector(".desk-body");
  const buttons = target.querySelectorAll("[data-panel]");
  function show(key) {
    buttons.forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.panel === key)),
    );
    if (key === "client" || key === "barber") {
      accountForm(body, key, {
        auth,
        db,
        onSaved: () =>
          ctx.refresh(
            body.querySelector("[role=status]")?.textContent ||
              "Cadastro atualizado.",
          ),
      });
      return;
    }
    if (!team.length) {
      body.textContent = "Cadastre um barbeiro para começar.";
      return;
    }
    if (key === "schedule") {
      const own = slots
        .filter(
          (s) => team.some((b) => b.id === s.barberId) && s.date >= today(),
        )
        .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
      body.innerHTML = `<form class="desk-form"><h3>Disponibilidade</h3><p class="muted">Defina o intervalo que os clientes podem reservar. Alterações não cancelam reservas existentes.</p><label>Jornada<select name="slot"><option value="">Nova jornada</option>${options(own.map((s) => [s.id, `${team.find((b) => b.id === s.barberId).name} · ${s.date.split("-").reverse().join("/")} · ${s.time}–${clock(mins(s.time) + s.duration)}${s.active === false ? " · bloqueada" : ""}`]))}</select></label>${selectTeam}${dateInput}<div class="time-pair"><label>Início<input type="time" name="start" step="300" value="08:00" required></label><label>Fim<input type="time" name="end" step="300" value="18:00" required></label></div><label><input name="active" type="checkbox" checked> Disponível para reservas</label><button>Salvar jornada</button><p role="status"></p></form>`;
      const form = body.querySelector("form"),
        f = form.elements;
      f.date.min = today();
      f.slot.onchange = () => {
        const s = own.find((x) => x.id === f.slot.value);
        f.barber.disabled = !!s;
        f.barber.value = s?.barberId || team[0].id;
        f.date.value = s?.date || today();
        f.start.value = s?.time || "08:00";
        f.end.value = s ? clock(mins(s.time) + s.duration) : "18:00";
        f.active.checked = s?.active !== false;
      };
      bind(form, async () => {
        const duration = mins(f.end.value) - mins(f.start.value);
        if (duration <= 0) throw Error("O fim deve ser posterior ao início.");
        const data = {
          date: f.date.value,
          time: f.start.value,
          duration,
          active: f.active.checked,
        };
        if (f.slot.value) await updateDoc(doc(db, "slots", f.slot.value), data);
        else
          await addDoc(collection(db, "slots"), {
            ...data,
            barberId: f.barber.value,
            booked: false,
          });
        return "Jornada salva.";
      });
    } else {
      body.innerHTML = `<form class="desk-form"><h3>Registrar atendimento avulso</h3><p class="muted">Registre um procedimento realizado sem agendamento, com ou sem cadastro de cliente.</p>${selectTeam}<label>Procedimento<select name="service">${options(catalog.map((s) => [s.id, s.name]))}</select></label>${dateInput}<label>Hora de início<input name="time" type="time" step="300" required></label><label>E-mail do cliente <small>(opcional)</small><input type="email" name="email" placeholder="Deixe vazio para registrar só o procedimento"></label><button>Registrar atendimento</button><p role="status"></p></form>`;
      const form = body.querySelector("form"),
        f = form.elements;
      f.date.max = today();
      const now = () =>
        new Date().toLocaleTimeString("en-GB", {
          timeZone: "America/Sao_Paulo",
          hour: "2-digit",
          minute: "2-digit",
        });
      f.time.value = clock(Math.floor(mins(now()) / 5) * 5);
      bind(form, async () => {
        const barberId = f.barber.value,
          date = f.date.value,
          time = f.time.value,
          start = mins(time),
          service = catalog.find((s) => s.id === f.service.value);
        if (
          date > today() ||
          (date === today() && time > now()) ||
          start + service.duration > 1440
        )
          throw Error("Informe um horário válido que já começou.");
        let client = null;
        const email = f.email.value.trim().toLowerCase();
        if (email) {
          const users = await getDocs(
            query(
              collection(db, "users"),
              where("email", "==", email),
              where("role", "==", "client"),
            ),
          );
          if (users.empty)
            throw Error(
              "Cliente não encontrado. Crie o login ou deixe o e-mail vazio.",
            );
          client = { ...users.docs[0].data(), id: users.docs[0].id };
        }
        const appointment = doc(collection(db, "appointments")),
          covered = Boolean(
            client?.clubActive &&
            plans[client.club]?.covered.includes(service.name),
          );
        const minutes = Array.from(
            { length: Math.ceil(service.duration / 5) },
            (_, i) => start + i * 5,
          ),
          refs = minutes.map((m) =>
            doc(db, "bookingLocks", `${barberId}_${date}_${m}`),
          );
        await runTransaction(db, async (tx) => {
          const taken = await Promise.all(refs.map((r) => tx.get(r)));
          if (taken.some((s) => s.exists()))
            throw Error(
              "Esse intervalo já está ocupado. Confira a agenda antes de registrar.",
            );
          const clientId = client?.id || null;
          refs.forEach((r, i) =>
            tx.set(r, {
              barberId,
              date,
              minute: minutes[i],
              clientId,
              appointmentId: appointment.id,
            }),
          );
          tx.set(appointment, {
            barberId,
            date,
            time,
            clientId,
            clientName: client?.name || "",
            service: service.name,
            duration: service.duration,
            price: covered ? 0 : service.price,
            clubApplied: covered,
            status: "completed",
            source: "walk-in",
            createdBy: user.uid,
            createdAt: serverTimestamp(),
          });
        });
        return "Atendimento avulso registrado.";
      });
    }
  }
  function bind(form, save) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const btn = form.querySelector("button"),
        status = form.querySelector("[role=status]");
      btn.disabled = true;
      try {
        const text = await save();
        await ctx.refresh(text);
      } catch (err) {
        status.textContent = err.message;
      } finally {
        btn.disabled = false;
      }
    };
  }
  buttons.forEach((b) => (b.onclick = () => show(b.dataset.panel)));
  show("schedule");
}
