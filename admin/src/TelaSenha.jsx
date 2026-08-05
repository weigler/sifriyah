// ---------------- Tela de senha ----------------
function TelaSenha({
  temDadosSalvos,
  onDesbloquear,
  onApagarTudo,
  onSemSenha,
  cloudConfig,
  cloudStatus,
  onConfigurarNuvem,
  onDesligarNuvem,
  onEntrarAdmin,
  statusAdminAuth,
}) {
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [confirmandoReset, setConfirmandoReset] = useState(false);
  const [confirmandoSemSenha, setConfirmandoSemSenha] = useState(false);
  const [mostrarConfigNuvem, setMostrarConfigNuvem] = useState(false);
  const [colado, setColado] = useState("");
  const [docId, setDocId] = useState("principal");
  const [emailAdminForm, setEmailAdminForm] = useState("");
  const [senhaAdminForm, setSenhaAdminForm] = useState("");
  const [erroNuvem, setErroNuvem] = useState("");
  const [emailAdminLock, setEmailAdminLock] = useState("");
  const [senhaAdminLock, setSenhaAdminLock] = useState("");
  const [erroAdminLock, setErroAdminLock] = useState("");

  async function fazerLoginAdmin() {
    setErroAdminLock("");
    const r = await onEntrarAdmin(emailAdminLock, senhaAdminLock);
    if (!r.ok) setErroAdminLock(r.erro);
  }

  async function entrar() {
    setErro("");
    if (!senha) {
      setErro("Digite uma senha.");
      return;
    }
    if (!temDadosSalvos && senha !== confirmar) {
      setErro("As senhas não coincidem.");
      return;
    }
    if (!temDadosSalvos && senha.length < 4) {
      setErro("Use pelo menos 4 caracteres.");
      return;
    }
    setCarregando(true);
    const r = await onDesbloquear(senha);
    setCarregando(false);
    if (!r.ok) setErro(r.erro);
  }

  async function conectarNuvem() {
    setErroNuvem("");
    try {
      const obj = parseFirebaseConfigColado(colado);
      onConfigurarNuvem(obj, docId || "principal");
      if (emailAdminForm && senhaAdminForm) {
        const r = await onEntrarAdmin(emailAdminForm, senhaAdminForm);
        if (!r.ok) {
          setErroNuvem(r.erro);
          return;
        }
      }
      setMostrarConfigNuvem(false);
    } catch (e) {
      setErroNuvem("Não consegui ler essa configuração. Confere se colou o bloco inteiro do Firebase.");
    }
  }

  const conectandoNuvem = !!cloudConfig && cloudStatus === "conectando";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: COLORS.burgundyDark,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        fontFamily: "'Source Serif 4', serif",
      }}
    >
      <div
        style={{
          background: COLORS.card,
          borderRadius: 14,
          padding: 28,
          maxWidth: 340,
          width: "100%",
          boxShadow: "0 20px 50px rgba(0,0,0,0.35)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 30 }}>🔒</span>
        </div>
        <h1
          style={{
            fontFamily: "'Playfair Display', serif",
            fontStyle: "italic",
            fontSize: 26,
            textAlign: "center",
            margin: "0 0 4px",
            color: COLORS.ink,
          }}
        >
          Sifriyah
        </h1>
        <div style={{ textAlign: "center", fontSize: 13, color: COLORS.inkSoft, marginBottom: 20 }}>
          {temDadosSalvos ? "Digite a senha pra abrir" : "Crie uma senha pra proteger os dados"}
        </div>

        {!cloudConfig && !mostrarConfigNuvem && (
          <div style={{ textAlign: "center", marginBottom: 16, display: "flex", flexDirection: "column", gap: 6 }}>
            <button
              onClick={() => onConfigurarNuvem(FIREBASE_CONFIG_PADRAO, DOC_ID_PADRAO)}
              style={{ background: "none", border: "none", color: COLORS.burgundy, fontSize: 12.5, textDecoration: "underline", cursor: "pointer" }}
            >
              Reconectar à nuvem deste projeto
            </button>
            <button
              onClick={() => setMostrarConfigNuvem(true)}
              style={{ background: "none", border: "none", color: COLORS.inkSoft, fontSize: 12, textDecoration: "underline", cursor: "pointer" }}
            >
              usar outra configuração (outro projeto Firebase)
            </button>
          </div>
        )}

        {!cloudConfig && mostrarConfigNuvem && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
            <label style={labelStyle}>Cole a configuração do Firebase (a mesma dos outros aparelhos)</label>
            <textarea
              value={colado}
              onChange={(e) => setColado(e.target.value)}
              placeholder={`const firebaseConfig = {\n  apiKey: "...",\n  projectId: "...",\n  ...\n};`}
              rows={5}
              style={{ ...inputBase, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}
            />
            <label style={labelStyle}>Código da biblioteca (o mesmo usado nos outros aparelhos)</label>
            <Input value={docId} onChange={(e) => setDocId(e.target.value)} placeholder="principal" />
            <label style={labelStyle}>E-mail de administrador</label>
            <Input type="email" value={emailAdminForm} onChange={(e) => setEmailAdminForm(e.target.value)} />
            <label style={labelStyle}>Senha de administrador</label>
            <Input type="password" value={senhaAdminForm} onChange={(e) => setSenhaAdminForm(e.target.value)} />
            {erroNuvem && <div style={{ color: COLORS.rust, fontSize: 12.5 }}>{erroNuvem}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <Button style={{ flex: 1 }} onClick={conectarNuvem}>
                Conectar
              </Button>
              <Button variant="ghost" onClick={() => setMostrarConfigNuvem(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {cloudConfig && (
          <div style={{ textAlign: "center", fontSize: 12, color: COLORS.inkSoft, marginBottom: 16 }}>
            {conectandoNuvem ? (
              <span style={{ color: COLORS.gold }}>conectando à nuvem…</span>
            ) : (
              <>
                conectado: <b>{cloudConfig.projectId}</b> · código <b>{cloudConfig.docId}</b>{" "}
                <button
                  onClick={onDesligarNuvem}
                  style={{ background: "none", border: "none", color: COLORS.burgundy, fontSize: 12, textDecoration: "underline", cursor: "pointer" }}
                >
                  trocar / desconectar da nuvem
                </button>
              </>
            )}
          </div>
        )}

        {cloudConfig && !conectandoNuvem && statusAdminAuth !== "logado" && (
          <div style={{ marginBottom: 18, padding: 12, background: COLORS.cream, borderRadius: 8, border: `1.5px solid ${COLORS.rule}` }}>
            <div style={{ fontSize: 12.5, color: COLORS.inkSoft, marginBottom: 8, textAlign: "center" }}>
              Este aparelho precisa logar como administrador antes de abrir a biblioteca.
            </div>
            <label style={labelStyle}>E-mail de administrador</label>
            <Input
              type="email"
              value={emailAdminLock}
              onChange={(e) => setEmailAdminLock(e.target.value)}
              style={{ marginBottom: 8, marginTop: 4 }}
            />
            <label style={labelStyle}>Senha de administrador</label>
            <Input
              type="password"
              value={senhaAdminLock}
              onChange={(e) => setSenhaAdminLock(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fazerLoginAdmin()}
              style={{ marginBottom: 8, marginTop: 4 }}
            />
            {erroAdminLock && <div style={{ color: COLORS.rust, fontSize: 12, marginBottom: 8 }}>{erroAdminLock}</div>}
            <Button style={{ width: "100%" }} onClick={fazerLoginAdmin} disabled={statusAdminAuth === "entrando"}>
              {statusAdminAuth === "entrando" ? "Entrando…" : "Entrar como administrador"}
            </Button>
          </div>
        )}

        {(!cloudConfig || statusAdminAuth === "logado") && (
          <>
        <Input
          type="password"
          placeholder="Senha"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (temDadosSalvos ? entrar() : null)}
          style={{ marginBottom: 10 }}
          autoFocus
          disabled={conectandoNuvem}
        />
        {!temDadosSalvos && (
          <Input
            type="password"
            placeholder="Confirme a senha"
            value={confirmar}
            onChange={(e) => setConfirmar(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && entrar()}
            style={{ marginBottom: 10 }}
            disabled={conectandoNuvem}
          />
        )}

        {erro && <div style={{ color: COLORS.rust, fontSize: 13, marginBottom: 10 }}>{erro}</div>}

        <Button onClick={entrar} style={{ width: "100%" }} disabled={carregando || conectandoNuvem}>
          {conectandoNuvem ? "Conectando…" : carregando ? "Abrindo…" : temDadosSalvos ? "Entrar" : "Criar e continuar"}
        </Button>

        {!conectandoNuvem && !temDadosSalvos && !confirmandoSemSenha && (
          <div style={{ textAlign: "center", marginTop: 14 }}>
            <button
              onClick={() => setConfirmandoSemSenha(true)}
              style={{ background: "none", border: "none", color: COLORS.inkSoft, fontSize: 12, textDecoration: "underline", cursor: "pointer" }}
            >
              usar sem senha
            </button>
          </div>
        )}
        {confirmandoSemSenha && (
          <div style={{ marginTop: 14, textAlign: "center", fontSize: 12.5, color: COLORS.inkSoft }}>
            Sem senha, os dados (nomes, telefones, valores) ficam bem menos protegidos caso alguém acesse o Firestore
            diretamente. Só recomendado se isso não for um problema pra você.
            <div style={{ marginTop: 8, display: "flex", gap: 8, justifyContent: "center" }}>
              <Button variant="ghost" style={{ padding: "6px 12px", fontSize: 12.5 }} onClick={() => setConfirmandoSemSenha(false)}>
                Cancelar
              </Button>
              <Button variant="subtle" style={{ padding: "6px 12px", fontSize: 12.5 }} onClick={onSemSenha}>
                Usar sem senha
              </Button>
            </div>
          </div>
        )}

        {!conectandoNuvem && temDadosSalvos && !confirmandoReset && (
          <div style={{ textAlign: "center", marginTop: 14 }}>
            <button
              onClick={() => setConfirmandoReset(true)}
              style={{ background: "none", border: "none", color: COLORS.inkSoft, fontSize: 12, textDecoration: "underline", cursor: "pointer" }}
            >
              esqueci a senha
            </button>
          </div>
        )}
        {confirmandoReset && (
          <div style={{ marginTop: 14, textAlign: "center", fontSize: 12.5, color: COLORS.rust }}>
            Sem a senha não dá pra recuperar os dados. A única saída é apagar tudo e recomeçar do zero.
            <div style={{ marginTop: 8, display: "flex", gap: 8, justifyContent: "center" }}>
              <Button variant="ghost" style={{ padding: "6px 12px", fontSize: 12.5 }} onClick={() => setConfirmandoReset(false)}>
                Cancelar
              </Button>
              <Button variant="subtle" style={{ padding: "6px 12px", fontSize: 12.5, color: COLORS.rust }} onClick={onApagarTudo}>
                Apagar tudo
              </Button>
            </div>
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div style={{ border: `1.5px dashed ${COLORS.rule}`, borderRadius: 10, padding: "24px 16px", textAlign: "center", color: COLORS.inkSoft, fontSize: 14, marginBottom: 16 }}>
      {text}
    </div>
  );
}

const labelStyle = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 10.5,
  letterSpacing: 0.5,
  textTransform: "uppercase",
  color: COLORS.inkSoft,
  marginBottom: -4,
};

const inputBase = {
  fontFamily: "'Source Serif 4', serif",
  fontSize: 15,
  padding: "10px 12px",
  borderRadius: 6,
  border: `1.5px solid ${COLORS.rule}`,
  background: "#fff",
  color: COLORS.ink,
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};
