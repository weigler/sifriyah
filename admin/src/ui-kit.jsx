// ---- Selo de status (elemento de assinatura) ----
function Stamp({ status }) {
  const map = {
    devolvido: { label: "DEVOLVIDO", color: COLORS.sage },
    atrasado: { label: "ATRASADO", color: COLORS.rust },
    emprestado: { label: "EMPRESTADO", color: COLORS.burgundy },
  };
  const s = map[status];
  return (
    <div
      style={{
        border: `2px solid ${s.color}`,
        color: s.color,
        borderRadius: "50%",
        width: 72,
        height: 72,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        fontFamily: "'JetBrains Mono', monospace",
        fontWeight: 600,
        fontSize: 9.5,
        letterSpacing: 0.5,
        transform: "rotate(-8deg)",
        flexShrink: 0,
        lineHeight: 1.15,
        padding: 4,
        opacity: 0.9,
      }}
    >
      {s.label}
    </div>
  );
}

function Section({ title, eyebrow, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
          letterSpacing: 1.5,
          color: COLORS.gold,
          marginBottom: 4,
          textTransform: "uppercase",
        }}
      >
        {eyebrow}
      </div>
      <h2
        style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: 22,
          fontWeight: 700,
          color: COLORS.ink,
          margin: "0 0 14px 0",
        }}
      >
        {title}
      </h2>
      {children}
    </div>
  );
}

function Input(props) {
  return (
    <input
      {...props}
      style={{
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
        ...props.style,
      }}
    />
  );
}

// Botão de excluir com confirmação leve (sem usar confirm() nativo do navegador).
// Primeiro clique pede confirmação por alguns segundos; segundo clique confirma e apaga.
function BotaoExcluir({ onConfirm, label = "excluir", small = false }) {
  const [confirmando, setConfirmando] = useState(false);
  const timerRef = React.useRef(null);

  function clicar() {
    if (confirmando) {
      clearTimeout(timerRef.current);
      setConfirmando(false);
      onConfirm();
      return;
    }
    setConfirmando(true);
    timerRef.current = setTimeout(() => setConfirmando(false), 3000);
  }

  return (
    <button
      onClick={clicar}
      style={{
        background: confirmando ? COLORS.rust : "none",
        border: confirmando ? "none" : "none",
        color: confirmando ? "#fff" : COLORS.rust,
        cursor: "pointer",
        fontSize: small ? 12 : 13,
        padding: confirmando ? "4px 9px" : 0,
        borderRadius: 5,
        textDecoration: confirmando ? "none" : "underline",
        fontFamily: "'Source Serif 4', serif",
        whiteSpace: "nowrap",
      }}
    >
      {confirmando ? "confirmar?" : label}
    </button>
  );
}

// seletor de tags mais organizado: mostra as já selecionadas primeiro, o resto em ordem
// alfabética, e um campo de busca quando a lista de tags fica grande
// uma "coluna" de formulário com rótulo em cima — usada pra alinhar campos numa linha tipo tabela,
// todos com a mesma largura e altura
function CampoCol({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 130px", minWidth: 110 }}>
      <label style={{ ...labelStyle, marginBottom: 0, fontSize: 11, lineHeight: 1.25 }}>{label}</label>
      {children}
    </div>
  );
}

function SeletorTags({ todasTags, selecionadas, onToggle }) {
  const [filtro, setFiltro] = useState("");
  const ordenadas = [...todasTags].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const jaSelecionadas = ordenadas.filter((t) => selecionadas.includes(t));
  const restante = ordenadas.filter((t) => !selecionadas.includes(t));
  const filtroLower = filtro.trim().toLowerCase();
  const restanteFiltrado = filtroLower ? restante.filter((t) => t.toLowerCase().includes(filtroLower)) : restante;
  const visiveis = [...jaSelecionadas, ...restanteFiltrado];

  return (
    <div>
      <label style={{ ...labelStyle, marginBottom: 4, display: "block" }}>
        Tags{selecionadas.length > 0 ? ` — ${selecionadas.length} selecionada${selecionadas.length > 1 ? "s" : ""}` : ""}
      </label>
      {todasTags.length > 8 && (
        <Input
          placeholder="Buscar tag…"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          style={{ marginBottom: 6, padding: "6px 10px", fontSize: 13 }}
        />
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {visiveis.map((t) => {
          const ativa = selecionadas.includes(t);
          return (
            <button
              key={t}
              type="button"
              onClick={() => onToggle(t)}
              style={{
                fontSize: 12.5,
                padding: "5px 10px",
                borderRadius: 14,
                border: `1.5px solid ${ativa ? COLORS.gold : COLORS.rule}`,
                background: ativa ? "#FBF3DC" : "#fff",
                color: ativa ? COLORS.ink : COLORS.inkSoft,
                cursor: "pointer",
              }}
            >
              #{t}
            </button>
          );
        })}
        {visiveis.length === 0 && <div style={{ fontSize: 12, color: COLORS.inkSoft }}>nenhuma tag encontrada</div>}
      </div>
    </div>
  );
}


// (pra evitar devolver sem querer sem ter registrado o pagamento)
function BotaoDevolver({ restante, descontoSugerido, diasRestantes, onConfirmar }) {
  const [aberto, setAberto] = useState(false);
  const [desconto, setDesconto] = useState(descontoSugerido > 0 ? String(descontoSugerido) : "");

  const precisaPainel = restante > 0 || descontoSugerido > 0;

  if (!precisaPainel) {
    return (
      <Button variant="ghost" style={{ padding: "7px 12px", fontSize: 13 }} onClick={() => onConfirmar(0)}>
        Marcar devolvido
      </Button>
    );
  }

  if (!aberto) {
    return (
      <Button variant="ghost" style={{ padding: "7px 12px", fontSize: 13 }} onClick={() => setAberto(true)}>
        Marcar devolvido
      </Button>
    );
  }

  const valorDesconto = parseFloat(desconto) || 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        background: "#FBF3DC",
        border: `1px solid ${COLORS.gold}`,
        borderRadius: 8,
        padding: 10,
        width: "100%",
      }}
    >
      {restante > 0 && (
        <div style={{ fontSize: 12, color: COLORS.rust }}>ainda falta {fmtMoney(restante)} do combinado.</div>
      )}
      {descontoSugerido > 0 && (
        <div style={{ fontSize: 12, color: COLORS.sage }}>
          devolvendo {diasRestantes} dia{diasRestantes === 1 ? "" : "s"} antes do prazo — desconto sugerido{" "}
          {fmtMoney(descontoSugerido)}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <label style={{ fontSize: 11.5, color: COLORS.inkSoft, whiteSpace: "nowrap" }}>desconto (R$)</label>
        <Input
          type="number"
          step="0.01"
          min="0"
          value={desconto}
          onChange={(e) => setDesconto(e.target.value)}
          style={{ width: 90, padding: "5px 8px", fontSize: 12.5 }}
        />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Button style={{ padding: "6px 12px", fontSize: 12.5 }} onClick={() => onConfirmar(valorDesconto)}>
          Confirmar devolução
        </Button>
        <Button variant="ghost" style={{ padding: "6px 12px", fontSize: 12.5 }} onClick={() => setAberto(false)}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

function Button({ children, variant = "primary", ...props }) {
  const styles = {
    primary: { background: COLORS.burgundy, color: "#fff", border: "none" },
    ghost: {
      background: "transparent",
      color: COLORS.burgundy,
      border: `1.5px solid ${COLORS.burgundy}`,
    },
    subtle: {
      background: COLORS.cream,
      color: COLORS.inkSoft,
      border: `1.5px solid ${COLORS.rule}`,
    },
    whats: {
      background: COLORS.whats,
      color: "#fff",
      border: "none",
    },
  };
  return (
    <button
      {...props}
      style={{
        fontFamily: "'Source Serif 4', serif",
        fontWeight: 600,
        fontSize: 14,
        padding: "9px 16px",
        borderRadius: 6,
        cursor: "pointer",
        ...styles[variant],
        ...props.style,
      }}
    >
      {children}
    </button>
  );
}

