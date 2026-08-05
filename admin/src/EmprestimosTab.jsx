// ---------------- Empréstimos ----------------
function EmprestimosTab({
  livros,
  emprestimos,
  pessoas,
  pessoaById,
  statusOf,
  totalPago,
  livroById,
  config,
  filas,
  onAdd,
  onDevolver,
  onRenovarSemana,
  onAlternarMultaAnulada,
  onPagar,
  onRemoverPagamento,
  onRemover,
  onRegistrarCobranca,
  onMarcarPerdidoDanificado,
}) {
  const [showForm, setShowForm] = useState(false);
  const [livroId, setLivroId] = useState("");
  const [pessoaId, setPessoaId] = useState("");
  const [nomeNovo, setNomeNovo] = useState("");
  const [sobrenomeNovo, setSobrenomeNovo] = useState("");
  const [telefoneNovo, setTelefoneNovo] = useState("");
  const [valorCombinado, setValorCombinado] = useState("");
  const [prazo, setPrazo] = useState("");
  const [filtro, setFiltro] = useState("ativos");
  const [pagamentoInputs, setPagamentoInputs] = useState({});
  const [erroForm, setErroForm] = useState("");

  function unidadesEmprestadas(livroId) {
    return emprestimos.filter((e) => e.livroId === livroId && !e.devolvido).length;
  }

  const livrosDisponiveis = livros.filter(
    (l) => unidadesEmprestadas(l.id) < (l.quantidade || 1)
  );

  // pessoas que já estão com algum livro emprestado agora (regra: 1 livro por pessoa por vez)
  const pessoasComEmprestimoAtivo = new Set(
    emprestimos.filter((e) => !e.devolvido).map((e) => e.pessoaId)
  );

  // regra: quem deve algo de um empréstimo anterior (devolvido ou não) não pode pegar outro livro
  // até quitar — soma o que falta pagar em cada empréstimo dessa pessoa, incluindo multa por atraso
  function pessoaTemDebito(pessoaId) {
    return emprestimos.some((e) => {
      if (e.pessoaId !== pessoaId) return false;
      const multa = calcularMulta(e, livroById(e.livroId), config);
      return Math.max(0, (e.valorCombinado || 0) + multa - totalPago(e)) > 0;
    });
  }

  // auto-preenchimento: ao escolher o livro, sugere valor combinado (valor semanal x limite de
  // semanas, já com desconto da promoção ativa) e a data de devolução (hoje + limite de semanas)
  useEffect(() => {
    if (!livroId) return;
    const l = livroById(livroId);
    if (!l) return;
    const sugerido = calcularValorSugerido(l, config.promocao);
    if (sugerido !== null) setValorCombinado(String(sugerido));
    if (l.limiteSemanas) setPrazo(somarSemanas(todayISO(), l.limiteSemanas));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livroId]);

  function submit() {
    if (!livroId || (!pessoaId && !nomeNovo.trim())) {
      setErroForm("Escolha um livro e quem está pegando.");
      return;
    }
    if (!prazo) {
      setErroForm("A data de devolução é obrigatória.");
      return;
    }

    // regra: 1 livro por pessoa por vez
    let pessoaExistente = pessoaId ? pessoaById(pessoaId) : null;
    if (!pessoaId && nomeNovo.trim()) {
      pessoaExistente = pessoas.find(
        (p) => nomeCompleto(p).toLowerCase() === `${nomeNovo} ${sobrenomeNovo}`.trim().toLowerCase()
      );
    }
    if (pessoaExistente && pessoasComEmprestimoAtivo.has(pessoaExistente.id)) {
      setErroForm(`${nomeCompleto(pessoaExistente)} já está com um livro emprestado. Só é permitido um por vez.`);
      return;
    }
    if (pessoaExistente && pessoaTemDebito(pessoaExistente.id)) {
      setErroForm(`${nomeCompleto(pessoaExistente)} tem um valor pendente de um empréstimo anterior. Regularize o pagamento antes de emprestar outro livro.`);
      return;
    }

    setErroForm("");
    onAdd({
      livroId,
      pessoaId: pessoaId || null,
      pessoaNovaNome: pessoaId ? null : nomeNovo,
      pessoaNovaSobrenome: pessoaId ? null : sobrenomeNovo,
      telefone: telefoneNovo,
      valorCombinado,
      prazo,
    });
    setLivroId("");
    setPessoaId("");
    setNomeNovo("");
    setSobrenomeNovo("");
    setTelefoneNovo("");
    setValorCombinado("");
    setPrazo("");
    setShowForm(false);
  }

  function preencherModelo(modelo, dados) {
    return modelo
      .replace(/\{(\w+)\}/g, (_, k) => (dados[k] !== undefined && dados[k] !== null ? dados[k] : ""))
      .replace(/ {2,}/g, " ")
      .trim();
  }

  function mensagemCobranca(emp, livro, pessoa) {
    const multa = calcularMulta(emp, livro, config);
    const restante = Math.max(0, (emp.valorCombinado || 0) + multa - totalPago(emp));
    const modelo =
      config.modeloCobranca ||
      `Oi {nome}! 👋 Passando pra lembrar sobre o livro "{livro}" que te emprestei — falta {valor} do combinado. Pix: {pix} ({pixnome}). Qualquer coisa me chama! 🙏`;
    return preencherModelo(modelo, {
      nome: pessoa ? pessoa.nome : "",
      livro: livro ? livro.titulo : "",
      valor: fmtMoney(restante),
      prazo: fmtDate(emp.prazo),
      dataInicio: fmtDate(emp.dataEmprestimo),
      dataFim: fmtDate(emp.prazo),
      pix: config.pix || "",
      pixnome: config.recebedor || "",
    });
  }

  function mensagemRenovacao(emp, livro, pessoa) {
    const multa = calcularMulta(emp, livro, config);
    const restante = Math.max(0, (emp.valorCombinado || 0) + multa - totalPago(emp));
    const modelo =
      config.modeloRenovacao ||
      `Oi {nome}! 👋 Só passando pra saber sobre o livro "{livro}" — o prazo era {prazo}. Você já terminou ou quer renovar por mais um tempo? Me avisa 🙂`;
    return preencherModelo(modelo, {
      nome: pessoa ? pessoa.nome : "",
      livro: livro ? livro.titulo : "",
      valor: fmtMoney(restante),
      prazo: fmtDate(emp.prazo),
      dataInicio: fmtDate(emp.dataEmprestimo),
      dataFim: fmtDate(emp.prazo),
      pix: config.pix || "",
      pixnome: config.recebedor || "",
    });
  }

  function mensagemConfirmacao(emp, livro, pessoa) {
    const modelo =
      config.modeloConfirmacao ||
      `Oi {nome}! 👋 Seu empréstimo do livro "{livro}" foi confirmado! Início: {dataInicio}. Devolução prevista: {dataFim}. Valor combinado: {valor}. Qualquer dúvida é só chamar 📚`;
    return preencherModelo(modelo, {
      nome: pessoa ? pessoa.nome : "",
      livro: livro ? livro.titulo : "",
      valor: fmtMoney(emp.valorCombinado || 0),
      prazo: fmtDate(emp.prazo),
      dataInicio: fmtDate(emp.dataEmprestimo),
      dataFim: fmtDate(emp.prazo),
      pix: config.pix || "",
      pixnome: config.recebedor || "",
    });
  }

  function mensagemRecibo(emp, livro, pessoa) {
    const modelo =
      config.modeloRecibo ||
      `Oi {nome}! ✅ Recebido! O empréstimo do livro "{livro}" está quitado — valor total: {valor}. Muito obrigado! 📚`;
    return preencherModelo(modelo, {
      nome: pessoa ? pessoa.nome : "",
      livro: livro ? livro.titulo : "",
      valor: fmtMoney(emp.valorCombinado || 0),
      prazo: fmtDate(emp.prazo),
      dataInicio: fmtDate(emp.dataEmprestimo),
      dataFim: fmtDate(emp.prazo),
      pix: config.pix || "",
      pixnome: config.recebedor || "",
    });
  }

  const diasAvisoVencimento = config.diasAvisoVencimento || 2;

  const lista = emprestimos
    .filter((e) => {
      if (filtro === "ativos") return !e.devolvido;
      if (filtro === "devolvidos") return e.devolvido;
      if (filtro === "atrasados") return !e.devolvido && statusOf(e) === "atrasado";
      if (filtro === "vencendo") {
        const dias = diasParaVencer(e);
        return dias !== null && dias >= 0 && dias <= diasAvisoVencimento;
      }
      if (filtro === "devedores") {
        const multa = calcularMulta(e, livroById(e.livroId), config);
        return Math.max(0, (e.valorCombinado || 0) + multa - totalPago(e)) > 0;
      }
      return true;
    })
    .sort((a, b) => {
      if (filtro === "devedores") {
        const restanteA = Math.max(0, (a.valorCombinado || 0) + calcularMulta(a, livroById(a.livroId), config) - totalPago(a));
        const restanteB = Math.max(0, (b.valorCombinado || 0) + calcularMulta(b, livroById(b.livroId), config) - totalPago(b));
        return restanteB - restanteA;
      }
      if (filtro === "vencendo") {
        return (diasParaVencer(a) ?? 999) - (diasParaVencer(b) ?? 999);
      }
      const pa = statusOf(a) === "atrasado" ? 0 : 1;
      const pb = statusOf(b) === "atrasado" ? 0 : 1;
      return pa - pb;
    });

  const qtdAtrasados = emprestimos.filter((e) => !e.devolvido && statusOf(e) === "atrasado").length;
  const qtdVencendo = emprestimos.filter((e) => {
    const dias = diasParaVencer(e);
    return dias !== null && dias >= 0 && dias <= diasAvisoVencimento;
  }).length;

  // débito de cada empréstimo, indiferente de já devolvido ou não — quem devolveu o livro mas
  // ainda deve fica igual de visível aqui quanto quem está com o livro em mãos
  const restanteDe = (e) => Math.max(0, (e.valorCombinado || 0) + calcularMulta(e, livroById(e.livroId), config) - totalPago(e));
  const emprestimosComDebito = emprestimos.filter((e) => restanteDe(e) > 0);
  const qtdDevedores = new Set(emprestimosComDebito.map((e) => e.pessoaId)).size;
  const totalDevido = emprestimosComDebito.reduce((soma, e) => soma + restanteDe(e), 0);

  return (
    <div>
      <Section eyebrow="Registro de saída" title="Empréstimos ativos">
        {qtdAtrasados > 0 && (
          <div
            onClick={() => setFiltro("atrasados")}
            style={{
              background: "#F7E3DA",
              border: `1.5px solid ${COLORS.rust}`,
              borderRadius: 8,
              padding: "10px 14px",
              marginBottom: 14,
              fontSize: 13,
              color: COLORS.rust,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            ⚠️ {qtdAtrasados} empréstimo(s) atrasado(s) — clique pra filtrar só eles.
          </div>
        )}
        {qtdDevedores > 0 && (
          <div
            onClick={() => setFiltro("devedores")}
            style={{
              background: "#F7E3DA",
              border: `1.5px solid ${COLORS.rust}`,
              borderRadius: 8,
              padding: "10px 14px",
              marginBottom: 14,
              fontSize: 13,
              color: COLORS.rust,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            💰 {qtdDevedores} pessoa(s) devendo, total de {fmtMoney(totalDevido)} — clique pra ver só quem deve.
          </div>
        )}
        {qtdVencendo > 0 && (
          <div
            onClick={() => setFiltro("vencendo")}
            style={{
              background: "#FBF3DC",
              border: `1.5px solid ${COLORS.gold}`,
              borderRadius: 8,
              padding: "10px 14px",
              marginBottom: 14,
              fontSize: 13,
              color: "#8A6A1F",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            🔔 {qtdVencendo} empréstimo(s) vencendo em até {diasAvisoVencimento} dia{diasAvisoVencimento === 1 ? "" : "s"} — clique pra ver.
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {["ativos", "vencendo", "atrasados", "devedores", "devolvidos", "todos"].map((f) => (
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
            {config.promocao?.ativa && config.promocao?.descricao && (
              <div
                style={{
                  background: "#FBF3DC",
                  border: `1px solid ${COLORS.gold}`,
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontSize: 13,
                  color: COLORS.ink,
                }}
              >
                🎉 <b>Promoção ativa:</b> {config.promocao.descricao}
                {config.promocao.validoAte ? ` (até ${fmtDate(config.promocao.validoAte)})` : ""}
              </div>
            )}

            <label style={labelStyle}>Livro</label>
            <select value={livroId} onChange={(e) => setLivroId(e.target.value)} style={inputBase}>
              <option value="">Selecione…</option>
              {livrosDisponiveis.map((l) => {
                const qtd = l.quantidade || 1;
                const livres = qtd - unidadesEmprestadas(l.id);
                return (
                  <option key={l.id} value={l.id}>
                    {l.titulo} {l.autor ? `— ${l.autor}` : ""} {qtd > 1 ? `(${livres} de ${qtd} disponíveis)` : ""}
                  </option>
                );
              })}
            </select>
            {livrosDisponiveis.length === 0 && (
              <div style={{ fontSize: 12, color: COLORS.rust }}>
                Nenhum livro disponível. Cadastre um no Acervo primeiro.
              </div>
            )}
            {livroId && (() => {
              const l = livroById(livroId);
              if (!l || (!l.valorSemanal && !l.limiteSemanas)) return null;
              return (
                <div style={{ fontSize: 12.5, color: COLORS.inkSoft, fontFamily: "'JetBrains Mono', monospace" }}>
                  {l.valorSemanal ? `${fmtMoney(l.valorSemanal)}/semana` : ""}
                  {l.limiteSemanas ? ` · limite de ${l.limiteSemanas} semana(s)` : ""}
                  {l.valorSemanaExtra ? ` · ${fmtMoney(l.valorSemanaExtra)}/semana extra` : ""}
                </div>
              );
            })()}
            {livroId && (() => {
              const filaDoLivro = filas
                .filter((f) => f.livroId === livroId)
                .sort((a, b) => (a.ordem ?? a.criadoEm) - (b.ordem ?? b.criadoEm));
              if (filaDoLivro.length === 0) return null;
              const primeiro = pessoaById(filaDoLivro[0].pessoaId);
              return (
                <div style={{ fontSize: 12, color: COLORS.burgundy, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span>
                    ⏳ {filaDoLivro.length} na fila — 1º: {primeiro ? nomeCompleto(primeiro) : "(pessoa removida)"}
                  </span>
                  {primeiro && (
                    <button
                      type="button"
                      onClick={() => setPessoaId(primeiro.id)}
                      style={{ background: "none", border: "none", color: COLORS.burgundy, textDecoration: "underline", cursor: "pointer", fontSize: 12 }}
                    >
                      usar esta pessoa
                    </button>
                  )}
                </div>
              );
            })()}

            <label style={labelStyle}>Quem está pegando</label>
            <select
              value={pessoaId}
              onChange={(e) => setPessoaId(e.target.value)}
              style={inputBase}
            >
              <option value="">+ Pessoa nova…</option>
              {pessoas.map((p) => (
                <option key={p.id} value={p.id} disabled={pessoasComEmprestimoAtivo.has(p.id)}>
                  {nomeCompleto(p)} {pessoasComEmprestimoAtivo.has(p.id) ? "— já com livro emprestado" : ""}
                </option>
              ))}
            </select>

            {!pessoaId && (
              <div style={{ display: "flex", gap: 8 }}>
                <Input placeholder="Nome" value={nomeNovo} onChange={(e) => setNomeNovo(e.target.value)} />
                <Input placeholder="Sobrenome" value={sobrenomeNovo} onChange={(e) => setSobrenomeNovo(e.target.value)} />
              </div>
            )}
            {!pessoaId && (
              <>
                <label style={labelStyle}>Celular (com DDD) — pra poder cobrar depois</label>
                <Input value={telefoneNovo} onChange={(e) => setTelefoneNovo(e.target.value)} placeholder="(11) 91234-5678" />
              </>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Valor combinado (R$) — pode ser 0</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={valorCombinado}
                  onChange={(e) => setValorCombinado(e.target.value)}
                  placeholder="0,00"
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Prazo de devolução *</label>
                <Input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} required />
              </div>
            </div>

            {erroForm && <div style={{ fontSize: 12.5, color: COLORS.rust }}>{erroForm}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <Button onClick={submit}>Registrar</Button>
              <Button variant="ghost" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {lista.length === 0 && (
          <EmptyState
            text={
              filtro === "devedores"
                ? "Ninguém devendo no momento. 🎉"
                : "Nada por aqui ainda. Registre o primeiro empréstimo acima."
            }
          />
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {lista.map((emp) => {
            const livro = livroById(emp.livroId);
            const pessoa = pessoaById(emp.pessoaId);
            const pago = totalPago(emp);
            const atraso = diasAtraso(emp);
            const multa = calcularMulta(emp, livro, config);
            const restante = Math.max(0, (emp.valorCombinado || 0) + multa - pago);
            const diasRestantes = !emp.devolvido && emp.prazo ? Math.max(0, -daysBetween(emp.prazo)) : 0;
            const semanasNaoUsadas = Math.floor(diasRestantes / 7);
            const descontoSugerido = livro && livro.valorSemanal ? semanasNaoUsadas * livro.valorSemanal : 0;
            const temFilaEsperando = filas.some((f) => f.livroId === emp.livroId);
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
                    com {pessoa ? nomeCompleto(pessoa) : "(pessoa removida)"} · desde {fmtDate(emp.dataEmprestimo)}
                    {emp.prazo ? ` · prazo ${fmtDate(emp.prazo)}` : ""}
                  </div>

                  {atraso > 0 && (
                    <div
                      style={{
                        fontSize: 12.5,
                        color: emp.multaAnulada ? COLORS.inkSoft : COLORS.rust,
                        marginBottom: 6,
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      <span>
                        ⚠ atrasado {atraso} dia{atraso === 1 ? "" : "s"}
                        {emp.multaAnulada ? " · multa anulada" : ` · multa: ${fmtMoney(multa)}`}
                      </span>
                      <button
                        onClick={() => onAlternarMultaAnulada(emp.id)}
                        style={{ background: "none", border: "none", color: COLORS.burgundy, cursor: "pointer", fontSize: 12, textDecoration: "underline" }}
                      >
                        {emp.multaAnulada ? "reativar multa" : "anular multa"}
                      </button>
                    </div>
                  )}

                  {atraso === 0 && !emp.devolvido && emp.prazo && diasRestantes <= diasAvisoVencimento && (
                    <div style={{ fontSize: 12.5, color: "#8A6A1F", marginBottom: 6 }}>
                      🔔 {diasRestantes === 0 ? "vence hoje" : `vence em ${diasRestantes} dia${diasRestantes === 1 ? "" : "s"}`}
                    </div>
                  )}

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
                    {multa > 0 && <span style={{ color: COLORS.rust }}>multa: {fmtMoney(multa)}</span>}
                    <span style={{ color: COLORS.sage }}>pago: {fmtMoney(pago)}</span>
                    {restante > 0 && <span style={{ color: COLORS.rust }}>falta: {fmtMoney(restante)}</span>}
                  </div>

                  {(emp.pagamentos || []).length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
                      {emp.pagamentos.map((p) => (
                        <div
                          key={p.id}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            fontSize: 12.5,
                            color: COLORS.inkSoft,
                            background: "#F5EFE0",
                            borderRadius: 5,
                            padding: "3px 8px",
                          }}
                        >
                          <span>{fmtDate(p.data)} · {fmtMoney(p.valor)}</span>
                          <BotaoExcluir small onConfirm={() => onRemoverPagamento(emp.id, p.id)} />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* registrar pagamento: sempre disponível, mesmo depois de devolvido, pra poder corrigir o registro */}
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
                    {!emp.devolvido && (
                      <Button
                        variant="subtle"
                        style={{ padding: "7px 12px", fontSize: 13 }}
                        onClick={() => onRenovarSemana(emp.id)}
                        disabled={temFilaEsperando}
                        title={
                          temFilaEsperando
                            ? "Tem gente esperando na fila desse livro — não dá pra renovar."
                            : "Adia o prazo em 7 dias e soma o valor semanal do livro, se cadastrado"
                        }
                      >
                        📅 +1 semana
                      </Button>
                    )}
                    {!emp.devolvido && (
                      <BotaoDevolver
                        restante={restante}
                        descontoSugerido={descontoSugerido}
                        diasRestantes={diasRestantes}
                        onConfirmar={(desconto) => onDevolver(emp.id, desconto)}
                      />
                    )}
                    {!emp.devolvido && (
                      <BotaoPerdidoDanificado
                        custoSugerido={livro && livro.valorReposicao ? livro.valorReposicao : 0}
                        onConfirmar={(tipo, custo) => onMarcarPerdidoDanificado(emp.id, tipo, custo)}
                      />
                    )}
                  </div>

                  {pessoa && pessoa.telefone && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                      <a href={linkWhatsApp(pessoa.telefone, mensagemConfirmacao(emp, livro, pessoa))} target="_blank" rel="noreferrer">
                        <Button variant="whats" style={{ padding: "7px 12px", fontSize: 13 }}>
                          💬 Confirmar empréstimo
                        </Button>
                      </a>
                    </div>
                  )}

                  {pessoa && pessoa.telefone && restante > 0 && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                      <a
                        href={linkWhatsApp(pessoa.telefone, mensagemCobranca(emp, livro, pessoa))}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => onRegistrarCobranca(emp.id, "cobranca", restante)}
                      >
                        <Button variant="whats" style={{ padding: "7px 12px", fontSize: 13 }}>
                          💬 Cobrar via WhatsApp
                        </Button>
                      </a>
                      {!emp.devolvido && (
                        <a
                          href={linkWhatsApp(pessoa.telefone, mensagemRenovacao(emp, livro, pessoa))}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => onRegistrarCobranca(emp.id, "lembrete", 0)}
                        >
                          <Button variant="subtle" style={{ padding: "7px 12px", fontSize: 13 }}>
                            💬 Lembrar prazo
                          </Button>
                        </a>
                      )}
                      <a
                        href={linkSMS(pessoa.telefone, mensagemCobranca(emp, livro, pessoa))}
                        onClick={() => onRegistrarCobranca(emp.id, "sms", restante)}
                      >
                        <Button variant="subtle" style={{ padding: "7px 12px", fontSize: 13 }}>
                          ✉️ SMS
                        </Button>
                      </a>
                    </div>
                  )}
                  {!emp.devolvido && !(pessoa && pessoa.telefone) && (
                    <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 8 }}>
                      Cadastre o celular {pessoa ? "de " + pessoa.nome : "dessa pessoa"} na aba Pessoas pra poder cobrar por WhatsApp.
                    </div>
                  )}
                  {emp.devolvido && emp.statusFinal && (
                    <div style={{ fontSize: 12, color: COLORS.rust, marginBottom: 8 }}>
                      📦 marcado como {emp.statusFinal} em {fmtDate(emp.dataDevolucao)}
                      {emp.custoReposicao > 0 ? ` · custo de reposição: ${fmtMoney(emp.custoReposicao)}` : ""}
                    </div>
                  )}
                  {emp.devolvido && !emp.statusFinal && (
                    <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 8 }}>
                      devolvido em {fmtDate(emp.dataDevolucao)}
                    </div>
                  )}

                  {pessoa && pessoa.telefone && restante < 0.01 && pago > 0 && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                      <a href={linkWhatsApp(pessoa.telefone, mensagemRecibo(emp, livro, pessoa))} target="_blank" rel="noreferrer">
                        <Button variant="whats" style={{ padding: "7px 12px", fontSize: 13 }}>
                          🧾 Enviar comprovante
                        </Button>
                      </a>
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
                    <BotaoExcluir label="excluir empréstimo" onConfirm={() => onRemover(emp.id)} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}

