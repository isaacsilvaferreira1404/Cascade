import { initializeApp, deleteApp } from "firebase/app";
import {
  initializeAuth,
  inMemoryPersistence,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  deleteUser,
} from "firebase/auth";
import { doc, setDoc, getFirestore } from "firebase/firestore";
export const adminEmail = "isaacsilvaferreira1234@gmail.com";
export function accountForm(target, role, { auth, db, onSaved }) {
  const title = role === "barber" ? "barbeiro" : "cliente";
  target.innerHTML = `<form class="desk-form"><h3>Novo ${title}</h3><p class="muted">A pessoa receberá um e-mail para definir a própria senha.</p><label>Nome<input name="name" minlength="2" maxlength="80" autocomplete="off" required></label><label>E-mail<input type="email" name="email" autocomplete="off" required></label><button>Criar login de ${title}</button><p role="status"></p></form>`;
  const form = target.querySelector("form"),
    message = form.querySelector("[role=status]");
  form.onsubmit = async (e) => {
    e.preventDefault();
    const button = form.querySelector("button"),
      name = form.elements.name.value.trim(),
      email = form.elements.email.value.trim().toLowerCase();
    if (name.length < 2 || email === adminEmail) {
      message.textContent =
        "Informe um nome válido e um e-mail que não seja o do administrador.";
      return;
    }
    button.disabled = true;
    message.textContent = "Criando conta…";
    let secondary,
      created,
      stored = false;
    try {
      secondary = initializeApp(auth.app.options, crypto.randomUUID());
      const session = initializeAuth(secondary, {
        persistence: inMemoryPersistence,
      });
      created = (
        await createUserWithEmailAndPassword(
          session,
          email,
          crypto.randomUUID() + crypto.randomUUID(),
        )
      ).user;
      await setDoc(
        doc(
          role === "client" ? getFirestore(secondary) : db,
          "users",
          created.uid,
        ),
        { name, email, role, club: "none", clubActive: false },
      );
      stored = true;
      form.reset();
      await sendPasswordResetEmail(auth, email);
      message.textContent =
        "Login criado. Oriente a pessoa a conferir o e-mail, inclusive a pasta de spam.";
    } catch (err) {
      if (created && !stored) await deleteUser(created).catch(() => {});
      message.textContent = stored
        ? "Conta criada, mas o e-mail não foi enviado. Use “Esqueci minha senha” na tela de entrada."
        : err.code === "auth/email-already-in-use"
          ? "Este e-mail já possui uma conta."
          : `Não foi possível criar o login (${err.code || "erro de conexão"}).`;
    } finally {
      if (secondary) await deleteApp(secondary);
      button.disabled = false;
      if (stored) await onSaved();
    }
  };
}
