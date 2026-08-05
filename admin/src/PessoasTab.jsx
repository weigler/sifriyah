// ---------------- Pessoas ----------------
function PessoasTab({
  pessoas,
  emprestimos,
  livroById,
  totalPago,
  onUpsert,
  onRemove,
  onRegerarCodigo,
  preCadastros = [],
  onImportarPreCadastro,
  onDescartarPreCadastro,
}) {
  const [novoNome, setNovoNome] = useState("");
  const [novoSobrenome, setNovoSobrenome] = useState("");
  const [novoTel, setNovoTel] = useState("");
  const [novoEmail, setNovoEmail] = useState("");
  const [novoGenero, setNovoGenero] = useState("");
  const [editandoId, setEditandoId] = useState(null);
  const [editNome, setEditNome] = useState("");
  const [editSobrenome, setEditSobrenome] = useState("");
  const [editTel, setEditTel] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editGenero, setEditGenero] = useState("");
  const [editCodigo, setEditCodigo] = useState("");
  const [historicoAberto, setHistoricoAberto] = useState({});

  const resumo = pessoas.map((p) => {
    const dela = emprestimos.filter((e) => e.pessoaId === p.id);
    const combinado = dela.reduce((s, e) => s + (e.valorCombinado || 0), 0);
    const pago = dela.reduce((s, e) => s + totalPago(e), 0);
    const ativos = dela.filter((e) => !e.devolvido);
    const historico = dela.filter((e) => e.devolvido).sort((a, b) => (a.dataDevolucao < b.dataDevolucao ? 1 : -1));
    return { pessoa: p, combinado, pago, saldo: combinado - pago, ativos, historico };
  });

  function abrirEdicao(p) {
    setEditandoId(p.id);
    setEditNome(p.nome);
    setEditSobrenome(p.sobrenome || "");
    setEditTel(p.telefone || "");
    setEditEmail(p.email || "");
    setEditGenero(p.genero || "");
    setEditCodigo(p.codigoUsuario || "");
  }

  function salvarEdicao() {
    onUpsert(
      { nome: editNome, sobrenome: editSobrenome, telefone: editTel, email: editEmail, genero: editGenero, codigoUsuario: editCodigo.trim().toUpperCase() },
      editandoId
    );
    setEditandoId(null);
  }

  return (
    <Section eyebrow="Contas e contatos" title="Pessoas">
      {preCadastros.length > 0 && (
        <div
          style={{
            background: "#FBF3DC",
            border: `1.5px solid ${COLORS.gold}`,
            borderRadius: 10,
            padding: 16,
            marginBottom: 20,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 16 }}>
            📥 Pré-cadastros recebidos ({preCadastros.length})
          </div>
          <div style={{ fontSize: 12.5, color: COLORS.inkSoft }}>
            Pessoas que se cadastraram sozinhas pela vitrine pública. Revise antes de adicionar.
          </div>
          {preCadastros.map((pc) => (
            <div
              key={pc.id}
              style={{
                background: "#fff",
                border: `1px solid ${COLORS.rule}`,
                borderRadius: 8,
                padding: "10px 12px",
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <div style={{ flex: 1, minWidth: 160 }}>
                <b>{pc.nome} {pc.sobrenome}</b>
                <div style={{ fontSize: 12.5, color: COLORS.inkSoft }}>
                  {pc.telefone || "sem celular"}{pc.email ? " · " + pc.email : ""}
                </div>
              </div>
              <Button style={{ padding: "6px 12px", fontSize: 12.5 }} onClick={() => onImportarPreCadastro(pc)}>
                Adicionar como pessoa
              </Button>
              <Button variant="ghost" style={{ padding: "6px 12px", fontSize: 12.5 }} onClick={() => onDescartarPreCadastro(pc)}>
                Descartar
              </Button>
            </div>
          ))}
        </div>
      )}

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
          <Input placeholder="Nome" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} style={{ flex: "1 1 120px" }} />
          <Input placeholder="Sobrenome" value={novoSobrenome} onChange={(e) => setNovoSobrenome(e.target.value)} style={{ flex: "1 1 120px" }} />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Input placeholder="Celular com DDD" value={novoTel} onChange={(e) => setNovoTel(e.target.value)} style={{ flex: "1 1 140px" }} />
          <Input placeholder="E-mail (opcional)" value={novoEmail} onChange={(e) => setNovoEmail(e.target.value)} style={{ flex: "1 1 140px" }} />
          <select value={novoGenero} onChange={(e) => setNovoGenero(e.target.value)} style={{ ...inputBase, flex: "1 1 140px" }}>
            <option value="">Gênero (opcional)</option>
            <option value="M">Masculino</option>
            <option value="F">Feminino</option>
          </select>
        </div>
        <Button
          style={{ alignSelf: "flex-start" }}
          onClick={() => {
            if (!novoNome.trim()) return;
            onUpsert({ nome: novoNome.trim(), sobrenome: novoSobrenome.trim(), telefone: novoTel, email: novoEmail, genero: novoGenero });
            setNovoNome("");
            setNovoSobrenome("");
            setNovoTel("");
            setNovoEmail("");
            setNovoGenero("");
          }}
        >
          Salvar pessoa
        </Button>
      </div>

      {resumo.length === 0 && <EmptyState text="Ninguém cadastrado ainda." />}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {resumo.map(({ pessoa: p, combinado, pago, saldo, ativos, historico }) => (
          <div key={p.id} style={{ background: COLORS.card, border: `1.5px solid ${COLORS.rule}`, borderRadius: 10, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 17 }}>{nomeCompleto(p)}</div>
              {saldo !== 0 && (
                <div
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 13,
                    color: saldo > 0 ? COLORS.rust : COLORS.sage,
                    fontWeight: 600,
                  }}
                >
                  {saldo > 0 ? `deve ${fmtMoney(saldo)}` : "em dia"}
                </div>
              )}
            </div>
            <div style={{ fontSize: 12, color: COLORS.inkSoft, marginTop: 2 }}>
              {ativos.length} livro(s) com {pronomeGenero(p, "ele", "ela", "essa pessoa")} agora
            </div>
            {ativos.length > 0 && (
              <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13.5 }}>
                {ativos.map((e) => {
                  const l = livroById(e.livroId);
                  return <li key={e.id}>{l ? l.titulo : "(livro removido)"}</li>;
                })}
              </ul>
            )}
            {historico.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <button
                  onClick={() => setHistoricoAberto((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
                  style={{ background: "none", border: "none", color: COLORS.burgundy, cursor: "pointer", fontSize: 12.5, textDecoration: "underline", padding: 0 }}
                >
                  {historicoAberto[p.id] ? "ocultar" : "ver"} histórico de leitura ({historico.length} livro{historico.length > 1 ? "s" : ""})
                </button>
                {historicoAberto[p.id] && (
                  <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13, color: COLORS.inkSoft }}>
                    {historico.map((e) => {
                      const l = livroById(e.livroId);
                      return (
                        <li key={e.id}>
                          {l ? l.titulo : "(livro removido)"} <span style={{ fontSize: 11.5 }}>· devolvido em {fmtDate(e.dataDevolucao)}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            {editandoId === p.id ? (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Input placeholder="Nome" value={editNome} onChange={(e) => setEditNome(e.target.value)} style={{ flex: "1 1 120px", padding: "7px 10px", fontSize: 13 }} />
                  <Input placeholder="Sobrenome" value={editSobrenome} onChange={(e) => setEditSobrenome(e.target.value)} style={{ flex: "1 1 120px", padding: "7px 10px", fontSize: 13 }} />
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Input placeholder="Celular" value={editTel} onChange={(e) => setEditTel(e.target.value)} style={{ flex: "1 1 130px", padding: "7px 10px", fontSize: 13 }} />
                  <Input placeholder="E-mail" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} style={{ flex: "1 1 130px", padding: "7px 10px", fontSize: 13 }} />
                  <select value={editGenero} onChange={(e) => setEditGenero(e.target.value)} style={{ ...inputBase, flex: "1 1 130px", padding: "7px 10px", fontSize: 13 }}>
                    <option value="">Gênero (opcional)</option>
                    <option value="M">Masculino</option>
                    <option value="F">Feminino</option>
                  </select>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Input
                    placeholder="Código de usuário"
                    value={editCodigo}
                    onChange={(e) => setEditCodigo(e.target.value.toUpperCase())}
                    style={{ flex: "1 1 130px", padding: "7px 10px", fontSize: 13, fontFamily: "'JetBrains Mono', monospace" }}
                  />
                  <Button
                    variant="subtle"
                    style={{ padding: "7px 10px", fontSize: 12.5, whiteSpace: "nowrap" }}
                    onClick={() => setEditCodigo(gerarCodigoUsuario(pessoas.map((x) => x.codigoUsuario)))}
                  >
                    🔄 gerar novo
                  </Button>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Button style={{ padding: "7px 12px", fontSize: 13 }} onClick={salvarEdicao}>
                    Salvar
                  </Button>
                  <Button variant="ghost" style={{ padding: "7px 12px", fontSize: 13 }} onClick={() => setEditandoId(null)}>
                    Cancelar
                  </Button>
                  <button
                    onClick={() => onRemove(p.id)}
                    style={{ marginLeft: "auto", background: "none", border: "none", color: COLORS.rust, fontSize: 12.5, cursor: "pointer", textDecoration: "underline" }}
                  >
                    remover pessoa
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 10, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, color: COLORS.inkSoft, fontFamily: "'JetBrains Mono', monospace" }}>
                  {p.telefone ? p.telefone : "sem celular"}
                  {p.email ? ` · ${p.email}` : ""}
                </span>
                {p.codigoUsuario && (
                  <span
                    style={{
                      fontSize: 12,
                      fontFamily: "'JetBrains Mono', monospace",
                      background: COLORS.cream,
                      border: `1px solid ${COLORS.rule}`,
                      borderRadius: 6,
                      padding: "3px 8px",
                      letterSpacing: 1,
                    }}
                  >
                    código: {p.codigoUsuario}
                  </span>
                )}
                {p.codigoUsuario && p.telefone && (
                  <a
                    href={linkWhatsApp(
                      p.telefone,
                      `Oi ${p.nome}! Seu código de usuário na ${APP_NAME} é: ${p.codigoUsuario}\n\nGuarda esse código — é com ele que você entra na fila de espera de um livro direto pelo nosso catálogo online, sem precisar me mandar mensagem.`
                    )}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: 12, color: COLORS.sage, textDecoration: "underline" }}
                  >
                    💬 enviar código
                  </a>
                )}
                <button
                  onClick={() => onRegerarCodigo(p.id)}
                  style={{ background: "none", border: "none", color: COLORS.inkSoft, cursor: "pointer", fontSize: 12, textDecoration: "underline" }}
                >
                  {p.codigoUsuario ? "gerar novo código" : "gerar código"}
                </button>
                <button
                  onClick={() => abrirEdicao(p)}
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

