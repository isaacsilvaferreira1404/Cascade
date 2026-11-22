import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
} from "firebase/auth";
export function loginScreen({ shell, auth, register }) {
  let mode = "login";
  function draw() {
    const signup = mode === "register",
      reset = mode === "reset";
    shell(
      `<section class="panel narrow login-card"><div class="eyebrow">CASCADE · ÁREA DO CLIENTE</div><h1>${signup ? "Criar conta" : reset ? "Recuperar senha" : "Entrar na conta"}</h1><p class="muted">${signup ? "Crie seu acesso para escolher um barbeiro e reservar um horário." : reset ? "Enviaremos as instruções para o e-mail da sua conta." : "Acesse seus horários e acompanhe seus atendimentos."}</p><form id="login">${signup ? '<label>Nome<input name="name" autocomplete="name" required minlength="2" maxlength="80"></label>' : ""}<label>E-mail<input name="email" type="email" autocomplete="email" required></label>${reset ? "" : `<label>Senha<input name="password" type="password" minlength="6" required autocomplete="${signup ? "new-password" : "current-password"}"></label>`}<button>${signup ? "Criar minha conta" : reset ? "Enviar instruções" : "Entrar"}</button><p role="status"></p></form><div class="actions">${mode === "login" ? '<button class="secondary" data-mode="register">Criar conta</button><button class="text-action" data-mode="reset">Esqueci minha senha</button>' : '<button class="text-action" data-mode="login">Voltar para o login</button>'}</div></section>`,
    );
    window.scrollTo({ top: 0, behavior: "instant" });
    document.querySelectorAll("[data-mode]").forEach(
      (b) =>
        (b.onclick = () => {
          mode = b.dataset.mode;
          draw();
        }),
    );
    const form = document.querySelector("#login");
    form.onsubmit = async (e) => {
      e.preventDefault();
      const f = form.elements,
        email = f.email.value.trim(),
        status = form.querySelector("[role=status]"),
        button = form.querySelector("button");
      button.disabled = true;
      try {
        if (reset) {
          await sendPasswordResetEmail(auth, email);
          status.textContent =
            "Se houver uma conta para esse e-mail, confira sua caixa de entrada.";
        } else if (signup) {
          await register(f.name.value.trim(), () =>
            createUserWithEmailAndPassword(auth, email, f.password.value),
          );
        } else await signInWithEmailAndPassword(auth, email, f.password.value);
      } catch (err) {
        const messages = {
          "auth/email-already-in-use":
            "Este e-mail já tem uma conta. Entre ou recupere sua senha.",
          "auth/invalid-credential": "E-mail ou senha incorretos.",
          "auth/network-request-failed": "Não foi possível alcançar o serviço de login. Verifique sua conexão e tente novamente.",
          "auth/operation-not-allowed": "O login por e-mail e senha está desativado no Firebase Authentication. Avise a administração.",
          "auth/unauthorized-domain": "Este endereço do site não está autorizado para autenticação. Avise a administração.",
          "auth/user-disabled": "Esta conta foi desativada. Entre em contato com a administração.",
          "auth/invalid-api-key": "A configuração de autenticação do site é inválida. Avise a administração.",
          "auth/weak-password": "Escolha uma senha mais forte.",
          "auth/too-many-requests":
            "Muitas tentativas. Tente novamente mais tarde.",
        };
        status.textContent =
          messages[err.code] ||
          `Não foi possível concluir a solicitação. Código: ${err.code || "indisponível"}.`;
      } finally {
        button.disabled = false;
      }
    };
  }
  draw();
}
