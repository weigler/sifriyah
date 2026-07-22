import React, { useState, useEffect, useMemo } from "react";

// ---- Fontes ----
function useFonts() {
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;1,600&family=Source+Serif+4:wght@400;500;600&family=JetBrains+Mono:wght@400;600&display=swap";
    document.head.appendChild(link);
    return () => document.head.removeChild(link);
  }, []);
}

const STORAGE_KEY = "sifriyah-biblioteca-dados"; // v1.1
const APP_NAME = "Sifriyah"; // ספרייה — hebraico moderno para "biblioteca"

const COLORS = {
  cream: "#F5EFE0",
  card: "#FBF7EC",
  ink: "#2B2118",
  inkSoft: "#5B4E3F",
  burgundy: "#6B2737",
  burgundyDark: "#4E1C28",
  gold: "#B8933E",
  sage: "#4B6B4A",
  rust: "#9C4A2C",
  whats: "#2E7D5B",
  rule: "#D8CBB0",
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function fmtMoney(v) {
  return (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function daysBetween(iso) {
  const d1 = new Date(iso);
  const d2 = new Date(todayISO());
  return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
}

// ---- Criptografia local (senha nunca sai do aparelho) ----
function bytesToB64(bytes) {
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}
function b64ToBytes(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
async function deriveKey(password, saltB64) {
  const enc = new TextEncoder();
  const salt = saltB64 ? b64ToBytes(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const material = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
    "deriveKey",
  ]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
  return { key, salt };
}
async function encryptJSON(obj, password) {
  const { key, salt } = await deriveKey(password);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(obj)));
  return JSON.stringify({
    v: 1,
    salt: bytesToB64(salt),
    iv: bytesToB64(iv),
    data: bytesToB64(new Uint8Array(cipher)),
  });
}
async function decryptJSON(raw, password) {
  const payload = JSON.parse(raw);
  const { key } = await deriveKey(password, payload.salt);
  const iv = b64ToBytes(payload.iv);
  const data = b64ToBytes(payload.data);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return JSON.parse(new TextDecoder().decode(plain));
}

// ---- Sincronização em nuvem (Firebase Firestore) — opcional ----
const CLOUD_CONFIG_KEY = "sifriyah-cloud-config"; // fica salvo local em cada aparelho (não é segredo)
let _fbApp = null;
let _fbDb = null;

function lerConfigNuvem() {
  try {
    const raw = localStorage.getItem(CLOUD_CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}
function salvarConfigNuvem(cfg) {
  if (cfg) localStorage.setItem(CLOUD_CONFIG_KEY, JSON.stringify(cfg));
  else localStorage.removeItem(CLOUD_CONFIG_KEY);
}

function carregarScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function inicializarFirebase(firebaseConfig) {
  if (_fbDb) return _fbDb;
  await carregarScript("https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js");
  await carregarScript("https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore-compat.js");
  // eslint-disable-next-line no-undef
  _fbApp = firebase.initializeApp(firebaseConfig);
  // eslint-disable-next-line no-undef
  _fbDb = firebase.firestore();
  return _fbDb;
}

async function nuvemLer(firebaseConfig, docId) {
  const db = await inicializarFirebase(firebaseConfig);
  const snap = await db.collection("sifriyah").doc(docId).get();
  if (!snap.exists) return null;
  return snap.data().blob || null;
}

async function nuvemSalvar(firebaseConfig, docId, blob) {
  const db = await inicializarFirebase(firebaseConfig);
  await db
    .collection("sifriyah")
    .doc(docId)
    .set({ blob, atualizadoEm: Date.now() });
}

function nuvemOuvir(firebaseConfig, docId, onChange) {
  inicializarFirebase(firebaseConfig).then((db) => {
    db.collection("sifriyah")
      .doc(docId)
      .onSnapshot((snap) => {
        if (snap.exists) onChange(snap.data().blob || null);
      });
  });
  return () => {}; // desinscrever simplificado
}

function normalizaTelefone(tel) {
  const digits = (tel || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 11) return "55" + digits; // assume Brasil, DDD+numero
  return digits;
}

function linkWhatsApp(telefone, texto) {
  const num = normalizaTelefone(telefone);
  return `https://wa.me/${num}?text=${encodeURIComponent(texto)}`;
}

function linkSMS(telefone, texto) {
  const num = (telefone || "").replace(/\D/g, "");
  return `sms:${num}?body=${encodeURIComponent(texto)}`;
}

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

export default function App() {
  useFonts();
  const [tab, setTab] = useState("emprestimos");
  const [livros, setLivros] = useState([]);
  const [emprestimos, setEmprestimos] = useState([]);
  const [contatos, setContatos] = useState({}); // { nome: {telefone, email} }
  const [config, setConfig] = useState({ pix: "", recebedor: "" });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  // ---- Nuvem (opcional) ----
  const [cloudConfig, setCloudConfigState] = useState(() => lerConfigNuvem());
  const [cloudDocId, setCloudDocId] = useState(() => lerConfigNuvem()?.docId || "principal");
  const [cloudStatus, setCloudStatus] = useState("desligada"); // desligada | conectando | sincronizada | erro
  const ultimoBlobRef = React.useRef(null);

  async function backendGet() {
    if (cloudConfig) return await nuvemLer(cloudConfig, cloudDocId);
    const res = await window.storage.get(STORAGE_KEY, false);
    return res ? res.value : null;
  }
  async function backendSet(blob) {
    ultimoBlobRef.current = blob;
    if (cloudConfig) {
      await nuvemSalvar(cloudConfig, cloudDocId, blob);
    } else {
      await window.storage.set(STORAGE_KEY, blob, false);
    }
  }

  function configurarNuvem(firebaseConfig, docId) {
    const cfg = { ...firebaseConfig, docId: docId || "principal" };
    salvarConfigNuvem(cfg);
    setCloudConfigState(cfg);
    setCloudDocId(cfg.docId);
  }
  function desligarNuvem() {
    salvarConfigNuvem(null);
    setCloudConfigState(null);
  }

  // ---- Bloqueio por senha ----
  const [unlocked, setUnlocked] = useState(false);
  const [temDadosSalvos, setTemDadosSalvos] = useState(false);
  const [senhaAtual, setSenhaAtual] = useState(""); // fica só na memória, nunca é salva

  useEffect(() => {
    (async () => {
      setCloudStatus(cloudConfig ? "conectando" : "desligada");
      try {
        const blob = await backendGet();
        setTemDadosSalvos(!!blob);
        setCloudStatus(cloudConfig ? "sincronizada" : "desligada");
      } catch (e) {
        setTemDadosSalvos(false);
        setCloudStatus(cloudConfig ? "erro" : "desligada");
      }
      setLoaded(true);
    })();
  }, [cloudConfig, cloudDocId]);

  // recebe atualizações vindas de outros aparelhos em tempo real
  useEffect(() => {
    if (!cloudConfig || !unlocked || !senhaAtual) return;
    nuvemOuvir(cloudConfig, cloudDocId, async (blob) => {
      if (!blob || blob === ultimoBlobRef.current) return; // veio da própria gravação, ignora
      try {
        const parsed = await decryptJSON(blob, senhaAtual);
        ultimoBlobRef.current = blob;
        setLivros(parsed.livros || []);
        setEmprestimos(parsed.emprestimos || []);
        setContatos(parsed.contatos || {});
        setConfig(parsed.config || { pix: "", recebedor: "" });
      } catch (e) {
        // outro aparelho pode ter mandado com senha diferente; ignora silenciosamente
      }
    });
  }, [cloudConfig, cloudDocId, unlocked, senhaAtual]);

  async function desbloquear(senha) {
    const blob = await backendGet();
    if (!blob) {
      setSenhaAtual(senha);
      setUnlocked(true);
      return { ok: true };
    }
    try {
      const parsed = await decryptJSON(blob, senha);
      ultimoBlobRef.current = blob;
      setLivros(parsed.livros || []);
      setEmprestimos(parsed.emprestimos || []);
      setContatos(parsed.contatos || {});
      setConfig(parsed.config || { pix: "", recebedor: "" });
      setSenhaAtual(senha);
      setUnlocked(true);
      return { ok: true };
    } catch (e) {
      return { ok: false, erro: "Senha incorreta." };
    }
  }

  function bloquear() {
    setSenhaAtual("");
    setUnlocked(false);
  }

  async function apagarTudoEComecarDeNovo() {
    await backendSet("");
    setLivros([]);
    setEmprestimos([]);
    setContatos({});
    setConfig({ pix: "", recebedor: "" });
    setSenhaAtual("");
    setUnlocked(false);
    setTemDadosSalvos(false);
  }

  useEffect(() => {
    if (!loaded || !unlocked || !senhaAtual) return;
    setSaving(true);
    const t = setTimeout(async () => {
      try {
        const criptografado = await encryptJSON({ livros, emprestimos, contatos, config }, senhaAtual);
        await backendSet(criptografado);
        setTemDadosSalvos(true);
        setCloudStatus(cloudConfig ? "sincronizada" : "desligada");
      } catch (e) {
        console.error("Erro ao salvar:", e);
        setCloudStatus(cloudConfig ? "erro" : "desligada");
      }
      setSaving(false);
    }, 400);
    return () => clearTimeout(t);
  }, [livros, emprestimos, contatos, config, loaded, unlocked, senhaAtual]);

  const pessoasConhecidas = useMemo(() => {
    const nomes = new Set([...emprestimos.map((e) => e.pessoa), ...Object.keys(contatos)]);
    return Array.from(nomes).filter(Boolean).sort();
  }, [emprestimos, contatos]);

  function livroById(id) {
    return livros.find((l) => l.id === id);
  }

  function statusOf(emp) {
    if (emp.devolvido) return "devolvido";
    if (emp.prazo && daysBetween(emp.prazo) > 0) return "atrasado";
    return "emprestado";
  }

  function totalPago(emp) {
    return (emp.pagamentos || []).reduce((s, p) => s + p.valor, 0);
  }

  // ---- Ações ----
  function addLivro(titulo, autor) {
    if (!titulo.trim()) return;
    setLivros((prev) => [...prev, { id: uid(), titulo: titulo.trim(), autor: autor.trim() }]);
  }

  function removeLivro(id) {
    if (emprestimos.some((e) => e.livroId === id && !e.devolvido)) {
      alert("Este livro está emprestado. Marque como devolvido antes de remover.");
      return;
    }
    setLivros((prev) => prev.filter((l) => l.id !== id));
  }

  function addEmprestimo(data) {
    setEmprestimos((prev) => [
      {
        id: uid(),
        livroId: data.livroId,
        pessoa: data.pessoa.trim(),
        dataEmprestimo: todayISO(),
        prazo: data.prazo || null,
        valorCombinado: parseFloat(data.valorCombinado) || 0,
        pagamentos: [],
        devolvido: false,
        dataDevolucao: null,
      },
      ...prev,
    ]);
    if (data.telefone || data.email) {
      setContato(data.pessoa.trim(), { telefone: data.telefone, email: data.email });
    }
  }

  function marcarDevolvido(id) {
    setEmprestimos((prev) =>
      prev.map((e) => (e.id === id ? { ...e, devolvido: true, dataDevolucao: todayISO() } : e))
    );
  }

  function addPagamento(id, valor) {
    const v = parseFloat(valor);
    if (!v || v <= 0) return;
    setEmprestimos((prev) =>
      prev.map((e) =>
        e.id === id
          ? { ...e, pagamentos: [...(e.pagamentos || []), { valor: v, data: todayISO() }] }
          : e
      )
    );
  }

  function removeEmprestimo(id) {
    setEmprestimos((prev) => prev.filter((e) => e.id !== id));
  }

  function setContato(nome, dados) {
    if (!nome) return;
    setContatos((prev) => ({
      ...prev,
      [nome]: { ...(prev[nome] || {}), ...dados },
    }));
  }

  function removeContato(nome) {
    setContatos((prev) => {
      const cp = { ...prev };
      delete cp[nome];
      return cp;
    });
  }

  if (!loaded) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: COLORS.cream,
          fontFamily: "'Source Serif 4', serif",
          color: COLORS.inkSoft,
        }}
      >
        Abrindo o catálogo…
      </div>
    );
  }

  if (!unlocked) {
    return (
      <TelaSenha
        temDadosSalvos={temDadosSalvos}
        onDesbloquear={desbloquear}
        onApagarTudo={apagarTudoEComecarDeNovo}
      />
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: COLORS.cream,
        fontFamily: "'Source Serif 4', serif",
        color: COLORS.ink,
        paddingBottom: 40,
      }}
    >
      <div style={{ background: COLORS.burgundyDark, padding: "28px 20px 22px", color: "#F5EFE0", position: "relative" }}>
        <button
          onClick={bloquear}
          title="Bloquear"
          style={{
            position: "absolute",
            top: 20,
            right: 20,
            background: "transparent",
            border: `1px solid ${COLORS.gold}`,
            color: COLORS.gold,
            borderRadius: 6,
            padding: "5px 10px",
            fontSize: 12,
            fontFamily: "'JetBrains Mono', monospace",
            cursor: "pointer",
          }}
        >
          🔒 bloquear
        </button>
        <div
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            letterSpacing: 2,
            color: COLORS.gold,
            textTransform: "uppercase",
            marginBottom: 4,
          }}
        >
          Grupo Caseiro · Fichário
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <h1
            style={{
              fontFamily: "'Playfair Display', serif",
              fontStyle: "italic",
              fontSize: 32,
              margin: 0,
              fontWeight: 700,
            }}
          >
            {APP_NAME}
          </h1>
          <span style={{ fontSize: 18, color: COLORS.gold, opacity: 0.85 }}>ספרייה</span>
        </div>
        <div style={{ fontSize: 13, opacity: 0.75, marginTop: 4 }}>
          {saving ? "salvando…" : "biblioteca do grupo"}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 2,
          padding: "0 16px",
          marginTop: 16,
          borderBottom: `2px solid ${COLORS.rule}`,
          overflowX: "auto",
        }}
      >
        {[
          { id: "emprestimos", label: "Empréstimos" },
          { id: "acervo", label: "Acervo" },
          { id: "pessoas", label: "Pessoas" },
          { id: "ajustes", label: "Ajustes" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12,
              letterSpacing: 1,
              textTransform: "uppercase",
              padding: "10px 14px",
              border: "none",
              background: "transparent",
              color: tab === t.id ? COLORS.burgundy : COLORS.inkSoft,
              borderBottom: tab === t.id ? `2px solid ${COLORS.burgundy}` : "2px solid transparent",
              marginBottom: -2,
              cursor: "pointer",
              fontWeight: tab === t.id ? 700 : 400,
              whiteSpace: "nowrap",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding: "20px 16px", maxWidth: 640, margin: "0 auto" }}>
        {tab === "emprestimos" && (
          <EmprestimosTab
            livros={livros}
            emprestimos={emprestimos}
            contatos={contatos}
            pessoasConhecidas={pessoasConhecidas}
            statusOf={statusOf}
            totalPago={totalPago}
            livroById={livroById}
            config={config}
            onAdd={addEmprestimo}
            onDevolver={marcarDevolvido}
            onPagar={addPagamento}
            onRemover={removeEmprestimo}
          />
        )}
        {tab === "acervo" && (
          <AcervoTab livros={livros} emprestimos={emprestimos} onAdd={addLivro} onRemove={removeLivro} />
        )}
        {tab === "pessoas" && (
          <PessoasTab
            pessoas={pessoasConhecidas}
            contatos={contatos}
            emprestimos={emprestimos}
            livroById={livroById}
            totalPago={totalPago}
            onSetContato={setContato}
            onRemoveContato={removeContato}
          />
        )}
        {tab === "ajustes" && (
          <AjustesTab
            config={config}
            onChange={setConfig}
            cloudConfig={cloudConfig}
            cloudStatus={cloudStatus}
            onConfigurarNuvem={configurarNuvem}
            onDesligarNuvem={desligarNuvem}
          />
        )}
      </div>
    </div>
  );
}

// ---------------- Empréstimos ----------------
function EmprestimosTab({
  livros,
  emprestimos,
  contatos,
  pessoasConhecidas,
  statusOf,
  totalPago,
  livroById,
  config,
  onAdd,
  onDevolver,
  onPagar,
  onRemover,
}) {
  const [showForm, setShowForm] = useState(false);
  const [livroId, setLivroId] = useState("");
  const [pessoa, setPessoa] = useState("");
  const [telefone, setTelefone] = useState("");
  const [valorCombinado, setValorCombinado] = useState("");
  const [prazo, setPrazo] = useState("");
  const [filtro, setFiltro] = useState("ativos");
  const [pagamentoInputs, setPagamentoInputs] = useState({});

  const livrosDisponiveis = livros.filter(
    (l) => !emprestimos.some((e) => e.livroId === l.id && !e.devolvido)
  );

  function submit() {
    if (!livroId || !pessoa.trim()) {
      alert("Escolha um livro e informe o nome de quem está pegando.");
      return;
    }
    onAdd({ livroId, pessoa, valorCombinado, prazo, telefone });
    setLivroId("");
    setPessoa("");
    setTelefone("");
    setValorCombinado("");
    setPrazo("");
    setShowForm(false);
  }

  function mensagemCobranca(emp, livro) {
    const restante = Math.max(0, (emp.valorCombinado || 0) - totalPago(emp));
    let msg = `Oi ${emp.pessoa}! 👋 Passando pra lembrar sobre o livro "${
      livro ? livro.titulo : ""
    }" que peguei emprestado com você — falta ${fmtMoney(restante)} do combinado.`;
    if (config.pix) {
      msg += ` Pix: ${config.pix}${config.recebedor ? " (" + config.recebedor + ")" : ""}.`;
    }
    msg += " Qualquer coisa me chama! 🙏";
    return msg;
  }

  function mensagemRenovacao(emp, livro) {
    return `Oi ${emp.pessoa}! 👋 Só passando pra saber sobre o livro "${
      livro ? livro.titulo : ""
    }" — o prazo era ${fmtDate(emp.prazo)}. Você já terminou ou quer renovar por mais um tempo? Me avisa 🙂`;
  }

  const lista = emprestimos.filter((e) => {
    if (filtro === "ativos") return !e.devolvido;
    if (filtro === "devolvidos") return e.devolvido;
    return true;
  });

  return (
    <div>
      <Section eyebrow="Registro de saída" title="Empréstimos ativos">
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {["ativos", "devolvidos", "todos"].map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
                letterSpacing: 0.5,
                textTransform: "uppercase",
                padding: "6px 12px",
                borderRadius: 20,
                border: `1.5px solid ${filtro === f ? COLORS.burgundy : COLORS.rule}`,
                background: filtro === f ? COLORS.burgundy : "transparent",
                color: filtro === f ? "#fff" : COLORS.inkSoft,
                cursor: "pointer",
              }}
            >
              {f}
            </button>
          ))}
        </div>

        {!showForm && (
          <Button onClick={() => setShowForm(true)} style={{ marginBottom: 18 }}>
            + Novo empréstimo
          </Button>
        )}

        {showForm && (
          <div
            style={{
              background: COLORS.card,
              border: `1.5px solid ${COLORS.rule}`,
              borderRadius: 10,
              padding: 16,
              marginBottom: 20,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <label style={labelStyle}>Livro</label>
            <select value={livroId} onChange={(e) => setLivroId(e.target.value)} style={inputBase}>
              <option value="">Selecione…</option>
              {livrosDisponiveis.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.titulo} {l.autor ? `— ${l.autor}` : ""}
                </option>
              ))}
            </select>
            {livrosDisponiveis.length === 0 && (
              <div style={{ fontSize: 12, color: COLORS.rust }}>
                Nenhum livro disponível. Cadastre um no Acervo primeiro.
              </div>
            )}

            <label style={labelStyle}>Quem está pegando</label>
            <Input
              list="pessoas-lista"
              value={pessoa}
              onChange={(e) => {
                setPessoa(e.target.value);
                const c = contatos[e.target.value];
                if (c && c.telefone) setTelefone(c.telefone);
              }}
              placeholder="Nome da pessoa"
            />
            <datalist id="pessoas-lista">
              {pessoasConhecidas.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>

            <label style={labelStyle}>Celular (com DDD) — pra poder cobrar depois</label>
            <Input
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              placeholder="(11) 91234-5678"
            />

            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Valor combinado (R$)</label>
                <Input
                  type="number"
                  step="0.01"
                  value={valorCombinado}
                  onChange={(e) => setValorCombinado(e.target.value)}
                  placeholder="0,00"
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Prazo de devolução</label>
                <Input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <Button onClick={submit}>Registrar</Button>
              <Button variant="ghost" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {lista.length === 0 && <EmptyState text="Nada por aqui ainda. Registre o primeiro empréstimo acima." />}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {lista.map((emp) => {
            const livro = livroById(emp.livroId);
            const pago = totalPago(emp);
            const restante = Math.max(0, (emp.valorCombinado || 0) - pago);
            const contato = contatos[emp.pessoa] || {};
            return (
              <div
                key={emp.id}
                style={{
                  background: COLORS.card,
                  border: `1.5px solid ${COLORS.rule}`,
                  borderRadius: 10,
                  padding: 16,
                  display: "flex",
                  gap: 14,
                }}
              >
                <Stamp status={statusOf(emp)} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 17 }}>
                    {livro ? livro.titulo : "(livro removido)"}
                  </div>
                  <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 6 }}>
                    com {emp.pessoa} · desde {fmtDate(emp.dataEmprestimo)}
                    {emp.prazo ? ` · prazo ${fmtDate(emp.prazo)}` : ""}
                  </div>

                  <div
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 13,
                      display: "flex",
                      gap: 14,
                      flexWrap: "wrap",
                      marginBottom: 8,
                    }}
                  >
                    <span>combinado: {fmtMoney(emp.valorCombinado)}</span>
                    <span style={{ color: COLORS.sage }}>pago: {fmtMoney(pago)}</span>
                    {restante > 0 && <span style={{ color: COLORS.rust }}>falta: {fmtMoney(restante)}</span>}
                  </div>

                  {!emp.devolvido && (
                    <>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="valor pago"
                          value={pagamentoInputs[emp.id] || ""}
                          onChange={(e) => setPagamentoInputs((p) => ({ ...p, [emp.id]: e.target.value }))}
                          style={{ width: 110, padding: "7px 10px", fontSize: 13 }}
                        />
                        <Button
                          variant="subtle"
                          style={{ padding: "7px 12px", fontSize: 13 }}
                          onClick={() => {
                            onPagar(emp.id, pagamentoInputs[emp.id]);
                            setPagamentoInputs((p) => ({ ...p, [emp.id]: "" }));
                          }}
                        >
                          Registrar pagamento
                        </Button>
                        <Button variant="ghost" style={{ padding: "7px 12px", fontSize: 13 }} onClick={() => onDevolver(emp.id)}>
                          Marcar devolvido
                        </Button>
                      </div>

                      {contato.telefone ? (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {restante > 0 && (
                            <a href={linkWhatsApp(contato.telefone, mensagemCobranca(emp, livro))} target="_blank" rel="noreferrer">
                              <Button variant="whats" style={{ padding: "7px 12px", fontSize: 13 }}>
                                💬 Cobrar via WhatsApp
                              </Button>
                            </a>
                          )}
                          <a href={linkWhatsApp(contato.telefone, mensagemRenovacao(emp, livro))} target="_blank" rel="noreferrer">
                            <Button variant="subtle" style={{ padding: "7px 12px", fontSize: 13 }}>
                              💬 Lembrar prazo
                            </Button>
                          </a>
                          <a href={linkSMS(contato.telefone, mensagemCobranca(emp, livro))}>
                            <Button variant="subtle" style={{ padding: "7px 12px", fontSize: 13 }}>
                              ✉️ SMS
                            </Button>
                          </a>
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: COLORS.inkSoft }}>
                          Cadastre o celular de {emp.pessoa} na aba Pessoas pra poder cobrar por WhatsApp.
                        </div>
                      )}
                    </>
                  )}
                  {emp.devolvido && (
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ fontSize: 12, color: COLORS.inkSoft }}>devolvido em {fmtDate(emp.dataDevolucao)}</span>
                      <button
                        onClick={() => onRemover(emp.id)}
                        style={{
                          marginLeft: "auto",
                          background: "none",
                          border: "none",
                          color: COLORS.rust,
                          fontSize: 12,
                          cursor: "pointer",
                          textDecoration: "underline",
                        }}
                      >
                        remover registro
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}

// ---------------- Acervo ----------------
function AcervoTab({ livros, emprestimos, onAdd, onRemove }) {
  const [titulo, setTitulo] = useState("");
  const [autor, setAutor] = useState("");

  return (
    <Section eyebrow="Catálogo" title="Acervo">
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        <Input placeholder="Título" value={titulo} onChange={(e) => setTitulo(e.target.value)} style={{ flex: "2 1 160px" }} />
        <Input placeholder="Autor (opcional)" value={autor} onChange={(e) => setAutor(e.target.value)} style={{ flex: "2 1 140px" }} />
        <Button
          onClick={() => {
            onAdd(titulo, autor);
            setTitulo("");
            setAutor("");
          }}
        >
          Adicionar
        </Button>
      </div>

      {livros.length === 0 && <EmptyState text="Nenhum livro cadastrado ainda." />}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {livros.map((l) => {
          const emprestado = emprestimos.some((e) => e.livroId === l.id && !e.devolvido);
          return (
            <div
              key={l.id}
              style={{
                background: COLORS.card,
                border: `1.5px solid ${COLORS.rule}`,
                borderRadius: 8,
                padding: "12px 14px",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 600, fontSize: 16 }}>{l.titulo}</div>
                {l.autor && <div style={{ fontSize: 13, color: COLORS.inkSoft }}>{l.autor}</div>}
              </div>
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10.5,
                  letterSpacing: 0.5,
                  padding: "4px 8px",
                  borderRadius: 12,
                  color: emprestado ? COLORS.burgundy : COLORS.sage,
                  border: `1px solid ${emprestado ? COLORS.burgundy : COLORS.sage}`,
                }}
              >
                {emprestado ? "FORA" : "NA PRATELEIRA"}
              </span>
              <button
                onClick={() => onRemove(l.id)}
                style={{ background: "none", border: "none", color: COLORS.rust, cursor: "pointer", fontSize: 18, lineHeight: 1 }}
                title="Remover"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

// ---------------- Pessoas ----------------
function PessoasTab({ pessoas, contatos, emprestimos, livroById, totalPago, onSetContato, onRemoveContato }) {
  const [novoNome, setNovoNome] = useState("");
  const [novoTel, setNovoTel] = useState("");
  const [novoEmail, setNovoEmail] = useState("");
  const [editando, setEditando] = useState(null);
  const [editTel, setEditTel] = useState("");
  const [editEmail, setEditEmail] = useState("");

  const resumo = pessoas.map((nome) => {
    const dela = emprestimos.filter((e) => e.pessoa === nome);
    const combinado = dela.reduce((s, e) => s + (e.valorCombinado || 0), 0);
    const pago = dela.reduce((s, e) => s + totalPago(e), 0);
    const ativos = dela.filter((e) => !e.devolvido);
    return { nome, combinado, pago, saldo: combinado - pago, ativos, contato: contatos[nome] || {} };
  });

  function abrirEdicao(nome) {
    setEditando(nome);
    setEditTel(contatos[nome]?.telefone || "");
    setEditEmail(contatos[nome]?.email || "");
  }

  function salvarEdicao(nome) {
    onSetContato(nome, { telefone: editTel, email: editEmail });
    setEditando(null);
  }

  return (
    <Section eyebrow="Contas e contatos" title="Pessoas">
      <div
        style={{
          background: COLORS.card,
          border: `1.5px solid ${COLORS.rule}`,
          borderRadius: 10,
          padding: 16,
          marginBottom: 20,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <label style={labelStyle}>Cadastrar pessoa</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Input placeholder="Nome" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} style={{ flex: "2 1 140px" }} />
          <Input placeholder="Celular com DDD" value={novoTel} onChange={(e) => setNovoTel(e.target.value)} style={{ flex: "1 1 140px" }} />
          <Input placeholder="E-mail (opcional)" value={novoEmail} onChange={(e) => setNovoEmail(e.target.value)} style={{ flex: "1 1 140px" }} />
        </div>
        <Button
          style={{ alignSelf: "flex-start" }}
          onClick={() => {
            if (!novoNome.trim()) return;
            onSetContato(novoNome.trim(), { telefone: novoTel, email: novoEmail });
            setNovoNome("");
            setNovoTel("");
            setNovoEmail("");
          }}
        >
          Salvar contato
        </Button>
      </div>

      {resumo.length === 0 && <EmptyState text="Ninguém cadastrado ainda." />}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {resumo.map((p) => (
          <div key={p.nome} style={{ background: COLORS.card, border: `1.5px solid ${COLORS.rule}`, borderRadius: 10, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 17 }}>{p.nome}</div>
              {p.saldo !== 0 && (
                <div
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 13,
                    color: p.saldo > 0 ? COLORS.rust : COLORS.sage,
                    fontWeight: 600,
                  }}
                >
                  {p.saldo > 0 ? `deve ${fmtMoney(p.saldo)}` : "em dia"}
                </div>
              )}
            </div>
            <div style={{ fontSize: 12, color: COLORS.inkSoft, marginTop: 2 }}>{p.ativos.length} livro(s) com ela agora</div>
            {p.ativos.length > 0 && (
              <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13.5 }}>
                {p.ativos.map((e) => {
                  const l = livroById(e.livroId);
                  return <li key={e.id}>{l ? l.titulo : "(livro removido)"}</li>;
                })}
              </ul>
            )}

            {editando === p.nome ? (
              <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Input placeholder="Celular" value={editTel} onChange={(e) => setEditTel(e.target.value)} style={{ flex: "1 1 130px", padding: "7px 10px", fontSize: 13 }} />
                <Input placeholder="E-mail" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} style={{ flex: "1 1 130px", padding: "7px 10px", fontSize: 13 }} />
                <Button style={{ padding: "7px 12px", fontSize: 13 }} onClick={() => salvarEdicao(p.nome)}>
                  Salvar
                </Button>
                <Button variant="ghost" style={{ padding: "7px 12px", fontSize: 13 }} onClick={() => setEditando(null)}>
                  Cancelar
                </Button>
              </div>
            ) : (
              <div style={{ marginTop: 10, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, color: COLORS.inkSoft, fontFamily: "'JetBrains Mono', monospace" }}>
                  {p.contato.telefone ? p.contato.telefone : "sem celular"}
                  {p.contato.email ? ` · ${p.contato.email}` : ""}
                </span>
                <button
                  onClick={() => abrirEdicao(p.nome)}
                  style={{ background: "none", border: "none", color: COLORS.burgundy, cursor: "pointer", fontSize: 13, textDecoration: "underline" }}
                >
                  editar contato
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}

// ---------------- Ajustes ----------------
function AjustesTab({ config, onChange, cloudConfig, cloudStatus, onConfigurarNuvem, onDesligarNuvem }) {
  const [pix, setPix] = useState(config.pix || "");
  const [recebedor, setRecebedor] = useState(config.recebedor || "");
  const [colado, setColado] = useState("");
  const [docId, setDocId] = useState(cloudConfig?.docId || "principal");
  const [erroNuvem, setErroNuvem] = useState("");

  function ativarNuvem() {
    setErroNuvem("");
    try {
      // aceita colar "const firebaseConfig = {...};" ou só o objeto {...}
      const texto = colado.replace(/const\s+firebaseConfig\s*=\s*/, "").replace(/;\s*$/, "");
      const obj = new Function("return (" + texto + ")")();
      if (!obj.apiKey || !obj.projectId) throw new Error("faltam campos");
      onConfigurarNuvem(obj, docId || "principal");
    } catch (e) {
      setErroNuvem("Não consegui ler essa configuração. Confere se colou o bloco inteiro do Firebase.");
    }
  }

  const statusLabel = {
    desligada: { texto: "desligada — salvando só neste aparelho", cor: COLORS.inkSoft },
    conectando: { texto: "conectando…", cor: COLORS.gold },
    sincronizada: { texto: "sincronizada com a nuvem ✓", cor: COLORS.sage },
    erro: { texto: "erro ao conectar — confere a configuração", cor: COLORS.rust },
  }[cloudStatus];

  return (
    <Section eyebrow="Cobrança" title="Ajustes">
      <div
        style={{
          background: COLORS.card,
          border: `1.5px solid ${COLORS.rule}`,
          borderRadius: 10,
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <label style={labelStyle}>Chave Pix (aparece nas mensagens de cobrança)</label>
        <Input value={pix} onChange={(e) => setPix(e.target.value)} placeholder="ex: seuemail@email.com ou telefone" />
        <label style={labelStyle}>Nome do recebedor (opcional)</label>
        <Input value={recebedor} onChange={(e) => setRecebedor(e.target.value)} placeholder="ex: Weigler" />
        <Button style={{ alignSelf: "flex-start" }} onClick={() => onChange({ pix, recebedor })}>
          Salvar
        </Button>
      </div>

      <div
        style={{
          background: COLORS.card,
          border: `1.5px solid ${COLORS.rule}`,
          borderRadius: 10,
          padding: 16,
          marginTop: 16,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 16 }}>
          Sincronização entre aparelhos
        </div>
        <div style={{ fontSize: 12.5, fontFamily: "'JetBrains Mono', monospace", color: statusLabel.cor }}>
          {statusLabel.texto}
        </div>

        {!cloudConfig ? (
          <>
            <label style={labelStyle}>Cole aqui a configuração do Firebase (firebaseConfig)</label>
            <textarea
              value={colado}
              onChange={(e) => setColado(e.target.value)}
              placeholder={`const firebaseConfig = {\n  apiKey: "...",\n  projectId: "...",\n  ...\n};`}
              rows={6}
              style={{ ...inputBase, fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5 }}
            />
            <label style={labelStyle}>Código da biblioteca (opcional, deixa "principal" se não souber)</label>
            <Input value={docId} onChange={(e) => setDocId(e.target.value)} placeholder="principal" />
            {erroNuvem && <div style={{ color: COLORS.rust, fontSize: 12.5 }}>{erroNuvem}</div>}
            <Button style={{ alignSelf: "flex-start" }} onClick={ativarNuvem}>
              Ativar sincronização
            </Button>
            <div style={{ fontSize: 12, color: COLORS.inkSoft }}>
              Repete esse mesmo passo (colando a mesma configuração e o mesmo código) nos outros aparelhos pra eles
              se conectarem à mesma biblioteca.
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 12.5, color: COLORS.inkSoft }}>
              Projeto: <b>{cloudConfig.projectId}</b> · código: <b>{cloudConfig.docId}</b>
            </div>
            <Button variant="ghost" style={{ alignSelf: "flex-start" }} onClick={onDesligarNuvem}>
              Desligar sincronização
            </Button>
          </>
        )}
      </div>
    </Section>
  );
}

// ---------------- Tela de senha ----------------
function TelaSenha({ temDadosSalvos, onDesbloquear, onApagarTudo }) {
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [confirmandoReset, setConfirmandoReset] = useState(false);

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

        <Input
          type="password"
          placeholder="Senha"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (temDadosSalvos ? entrar() : null)}
          style={{ marginBottom: 10 }}
          autoFocus
        />
        {!temDadosSalvos && (
          <Input
            type="password"
            placeholder="Confirme a senha"
            value={confirmar}
            onChange={(e) => setConfirmar(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && entrar()}
            style={{ marginBottom: 10 }}
          />
        )}

        {erro && <div style={{ color: COLORS.rust, fontSize: 13, marginBottom: 10 }}>{erro}</div>}

        <Button onClick={entrar} style={{ width: "100%" }} disabled={carregando}>
          {carregando ? "Abrindo…" : temDadosSalvos ? "Entrar" : "Criar e continuar"}
        </Button>

        {temDadosSalvos && !confirmandoReset && (
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
